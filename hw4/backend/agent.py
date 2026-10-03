"""Campus Customs shopping agent — Pydantic AI wiring.

Builds the "Handsome Dan" agent on an OpenAI model reached through the Portkey
gateway (PORTKEY_API_KEY from .env), loads the system prompt from
prompts/prompt.md, registers the shop tools, and exposes run_chat() which the
FastAPI route in main.py calls. The model default is gpt-6-luna; override with
MODEL_NAME in .env. The API key is read from the environment and never logged
or returned to the client.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

from dotenv import load_dotenv

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from openai import AsyncOpenAI
from pydantic_ai import Agent, ModelRetry, RunContext, capture_run_messages
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import RunUsage, UsageLimits

import audit
from models import ChatReply, HistoryTurn, PageContext, PageResults, ShopAnswer
from tools import ShopDeps, register_tools

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
PROMPTS_DIR = BACKEND_DIR / "prompts"

# Closest .env wins: backend/, then project root, then the folders above.
for env_dir in (BACKEND_DIR, PROJECT_DIR, PROJECT_DIR.parent, PROJECT_DIR.parent.parent):
    load_dotenv(env_dir / ".env", override=False)

MODEL_NAME = os.getenv("MODEL_NAME", "gpt-6-luna")
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1")
TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60"))

class AgentConfigError(RuntimeError):
    """Raised when the agent can't be configured (e.g. missing API key)."""


# A single chat turn: a normal turn uses 1-3 tool calls plus the reply; these caps
# bound the worst case. total_tokens_limit (input + output, summed over every model
# request in the turn) caps what one message can cost, so nobody can abuse the model.
CHAT_LIMITS = UsageLimits(request_limit=6, tool_calls_limit=8, total_tokens_limit=24000)


def require_api_key() -> str:
    key = os.getenv("PORTKEY_API_KEY", "").strip()
    if not key:
        raise AgentConfigError(
            "PORTKEY_API_KEY is not set. Add it to a .env in this project or a parent folder."
        )
    return key


def build_model() -> OpenAIResponsesModel:
    # Responses API: gpt-6-luna rejects function tools + reasoning on /chat/completions.
    key = require_api_key()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_BASE_URL,
        timeout=TIMEOUT_SECONDS,
        max_retries=2,
        default_headers={
            "x-portkey-api-key": key,
            "x-portkey-provider": os.getenv("PORTKEY_PROVIDER", "openai"),
        },
    )
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def load_system_prompt() -> str:
    return (PROMPTS_DIR / "prompt.md").read_text(encoding="utf-8").strip()


CHAT_CARDS = 6  # mini-cards inside the chat bubble; the page shows every match

# Speed/cost: a shop assistant needs light reasoning — the tools do the real work
# (exact prices, stock, counts). Low effort + concise text cut latency and tokens.
# Override with AGENT_REASONING_EFFORT=medium if answers ever get sloppy.
MODEL_SETTINGS = OpenAIResponsesModelSettings(
    openai_reasoning_effort=os.getenv("AGENT_REASONING_EFFORT", "low"),
    openai_text_verbosity="low",
    max_tokens=900,
)


def build_agent() -> Agent[ShopDeps, ShopAnswer]:
    agent = Agent(
        build_model(),
        deps_type=ShopDeps,
        output_type=ShopAnswer,
        instructions=load_system_prompt(),
        model_settings=MODEL_SETTINGS,
        retries=1,  # one fix-up per tool / output-validator failure (cheaper); a 2nd failure ends the turn
    )
    register_tools(agent)

    @agent.instructions
    def shopper_context(ctx: RunContext[ShopDeps]) -> str:
        """Per-turn context: who is chatting and which page they are on."""
        lines = ["## This conversation"]
        u = ctx.deps.user
        if u is not None:
            lines.append(
                f"- Signed-in shopper: {u.first_name or u.name}. Greet them by first name. "
                "Call get_customer_profile for account details and get_past_interests for "
                "what they looked at before."
            )
        else:
            lines.append("- Guest shopper (not signed in). Nothing is remembered after this visit.")
        p = ctx.deps.page
        if p is not None:
            where = f"- Current page: {p.page} ({p.path})"
            if p.product_name:
                where += f", product \"{p.product_name}\" (product_id {p.product_id})"
            if p.filters:
                where += f", filters {p.filters}"
            lines.append(where + ". \"This\"/\"it\" usually means what is on this page.")
        from season import today_line  # season + date in New Haven, e.g. "it's fall (October 3)"

        lines.append(f"- {today_line()}")
        return "\n".join(lines)

    @agent.output_validator
    def only_real_products(ctx: RunContext[ShopDeps], answer: ShopAnswer) -> ShopAnswer:
        """Safety net: every product the agent names must have come from a tool call
        in this turn. Unknown ids send the model back to fix its answer."""
        unknown = [pid for pid in answer.matches if pid not in ctx.deps.shown]
        if unknown:
            raise ModelRetry(
                f"These product_ids were not returned by a tool this turn: {unknown}. "
                "Only list ids from tool results; call search_catalogue or "
                "get_product_details first if needed."
            )
        answer.matches = list(dict.fromkeys(answer.matches))  # dedupe, keep order
        return answer

    return agent


# Built once at import; reused across requests.
_agent: Agent[ShopDeps, ShopAnswer] | None = None


def get_agent() -> Agent[ShopDeps, ShopAnswer]:
    global _agent
    if _agent is None:
        _agent = build_agent()
    return _agent


def _to_messages(turns: list[HistoryTurn]) -> list[ModelMessage]:
    """Replay earlier turns to the model as plain text (cheap, no tool traces)."""
    messages: list[ModelMessage] = []
    for t in turns:
        if t.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=t.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=t.content)]))
    return messages


async def run_chat(
    message: str,
    user=None,
    page: PageContext | None = None,
    history: list[HistoryTurn] | None = None,
    actor: str = "g:anon",
) -> ChatReply:
    """Run one chat turn. `user` is the signed-in auth.User (None for guests), `page` the
    validated page context, `history` the earlier turns to replay (DB for members,
    browser for guests), `actor` the shopper's salted id from audit.actor_key().
    Returns the reply, mini-cards, and optional page results.

    Every turn goes to the append-only audit trail (audit.py): one tool_call entry per
    tool call, then run_end; if the run raises, an error entry and the exception is
    re-raised (with `usage_tokens` attached). Audit writes never break the chat."""
    deps = ShopDeps(user=user, page=page, first_name=getattr(user, "first_name", None))
    history_msgs = _to_messages(history or [])
    run_id = audit.new_run_id()
    run_usage = RunUsage()  # filled in place by the run: exact even when the run raises
    started = time.perf_counter()
    with capture_run_messages() as captured:
        try:
            result = await get_agent().run(
                message,
                deps=deps,
                message_history=history_msgs or None,
                usage_limits=CHAT_LIMITS,
                usage=run_usage,
            )
        except BaseException as exc:  # usage limit, content filter, model/HTTP error, cancel
            tokens = audit.record_run(
                captured,
                history_len=len(history_msgs),
                actor=actor,
                run_id=run_id,
                latency_ms=int((time.perf_counter() - started) * 1000),
                model=MODEL_NAME,
                usage=run_usage,
                error=exc,
            )
            try:
                exc.usage_tokens = tokens  # lets main.py count a failed turn in the token budget
            except Exception:
                pass
            raise
    answer = result.output
    tokens = audit.record_run(
        result.new_messages,
        actor=actor,
        run_id=run_id,
        latency_ms=int((time.perf_counter() - started) * 1000),
        model=MODEL_NAME,
        usage=result.usage,
        matches=len(answer.matches),
        show_on_page=answer.show_on_page,
    )
    cards = [deps.shown[pid] for pid in answer.matches if pid in deps.shown]
    page_results = None
    if answer.show_on_page and cards:
        page_results = PageResults(
            label=(answer.search_label or "Your search").strip()[:80],
            product_ids=[c.product_id for c in cards],
        )
    return ChatReply(
        content=answer.reply,
        products=cards[:CHAT_CARDS],
        page_results=page_results,
        usage_tokens=tokens,  # total tokens of this turn (daily budget in main.py; not sent to the browser)
    )

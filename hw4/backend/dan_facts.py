"""Verified Handsome Dan / Yale Bulldogs facts — the one source for GET /api/dan/facts.

prompts/prompt.md ("## About Handsome Dan") repeats these texts word for word so the
chat agent and the website tell the same story; keep both in sync when editing.
Every fact was checked against the sources below (October 2026) and written in our
own words. If a fact can't be verified, it doesn't go in.
"""

from __future__ import annotations

from models import DanFact

SOURCES: tuple[str, ...] = (
    "https://en.wikipedia.org/wiki/Handsome_Dan",
    "https://www.yale.edu/about-yale/traditions-history",
    "https://en.wikipedia.org/wiki/Boola_Boola",
)

DAN_FACTS: tuple[DanFact, ...] = (
    DanFact(id="live-mascot", text="Handsome Dan is a real bulldog: the live mascot of Yale's sports teams."),
    DanFact(id="first-dan-1889", text="The first Handsome Dan joined Yale in 1889, bought by student Andrew Graves."),
    DanFact(id="westminster", text="Dan I was a champion show dog who took first prize at the Westminster Dog Show."),
    DanFact(
        id="crimson",
        text="Dan I was picked partly for staying calm around bands and kids, and for disliking crimson and tigers (Harvard and Princeton).",
    ),
    DanFact(id="led-across-the-field", text="Dan I began the tradition of being led across the field before football and baseball games."),
    DanFact(id="payne-whitney", text="The original Dan is on display in a sealed glass case in a trophy room at Payne Whitney Gym."),
    DanFact(id="dognapped-1934", text="Harvard students dognapped Handsome Dan II the day before the 1934 Harvard-Yale game."),
    DanFact(id="sports-illustrated", text="Handsome Dan IX made the cover of Sports Illustrated in November 1956."),
    DanFact(
        id="maurice",
        text="Handsome Dan XIII, known as Maurice, served longer than any other Dan and is the only one to come out of retirement.",
    ),
    DanFact(id="bulldog-song", text="Yale credits Handsome Dan with inspiring Cole Porter's fight song \"Bulldog, Bulldog.\""),
    DanFact(id="boola-boola", text="The Yale football song \"Boola Boola\" dates to 1900 and is usually credited to Allan M. Hirsh, Class of 1901."),
    DanFact(
        id="kingman",
        text="Kingman became Handsome Dan XIX, the 19th Dan, in 2021.",
    ),
)

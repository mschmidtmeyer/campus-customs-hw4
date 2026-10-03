# HW 4 — AI Prompts Log

Log of every prompt typed into the vibe coder (Claude Code) while building the Campus Customs shop website and chatbot.
Each section has the problem number and title, at least one prompt in my own words, and a follow-up prompt when one was needed.

---

## Problem 1: Vibe Coder Prompts

### Prompt 1 (my own words)

> Yo we'll work in HW4

### Prompt 2 (my own words)

> Okay, so I'm gonna be working on homework four, which is about um, creating a campus custom shop website and a chatbot. Okay, um, I will be building a React plus Vita TypeScript front end and a Python fast API backend um, that will be using a Pydantic AI agent. The shoppers, which would be the customers, should be able to browse the products of Custom Compass, create accounts, chat about the merge with the chatbot, see matching items appear on the page, and kind of get honest answers about their questions in terms of price, stock, and everything from a local database, which the Pydantic AI agent will be able to access. Um, I'm going to be using my port key API key uh, for my agent's AI calls using, in principle, uh, ChatGPT 5.6 Astra. And um, I've downloaded the data. You should be able to see it on the folder. Please make sure that the data is there um, and that the zip folder is unzipped. Also create as part of the problem number one, create a document called AI um, underscore prompts dot MD, which will be kept updated as I work. Um, this file will be a log of everything that I type into the vibe coder. Coder um, and include this as a pre kind of oh now you can include this as part of problem one every single problem that is kind of saved there should have both the number of problems so problem one double point uh vibe coder prompts which in this case is the title But in the other problems, the title would will be different. Um, so each section in this document should include first the problem number and title, the at least one of the problems that I typed in my own words, which is what I'm doing, and then one follow-up prompt if it is needed by Claude

### Prompt 3 (my own words)

> In terms of the model, use um, as a default GPT 5.6 uses a default uh, GPT 6 Luna unless I tell you to use GPT 5.6 Astra. And not don't use the downloads folder. Only work on the folder that it is specifically for AI foundations. HW4.

### Prompt 4 (my own words)

> GPT 6 Luna

### Follow-up prompt

None needed yet.

---

## Problem 2: Analyze the Database

### Prompt 1 (my own words)

> Okay, so now problem two, um, analyze the database. That is the title. Please um, show me what the database data slash campus customs dot DB um, has and help me understand the fields of each table. I should at minimum understand catalog, inventory, and users, but I want to understand anything, everything. So please um, help me out.

### Follow-up prompt

> Okay, so help me clean this the tables. Uh, for example, in catalog, make sure that the garment type is better. Um, hoodie and pullover hoodie, I want them to be separated. Help me out also with the colors if you see anything that's kind of different that can be normalized. And then create the file output slash harness.md. There, um, write down uh, what each table means. What it has, the fields, in one short line, on why each of the fields matter. For the shop, or for the chatbot, with which the customers will be interacting with.

### Follow-up prompt 2

> Are these prompts being saved in the prompts MD file?

---

## Problem 3: Build the Campus Customs Website

### Prompt 1 (my own words)

> As part of problem three, which is called build the campus customs website, For this, for doing this, we'll scaffold a React plus Vita plus TypeScript front end for the cas uh, Campus Customs website. Um, and it will have first a navigation bar at the top that links to the main pages, which will be home, products, about us, login, create account. And we'll probably add some one or two more pages. Just think about what we could add. Um, and we'll be pulling kind of the style wording from the yellowbulldogblue.com website for the part of home and about us. But we're going to have to write the pages in our own voice. Um, so For the home, we'll just say that we have Yale officially licensed merchandise, okay? We'll just add pictures, add different stylings and on the pic kind of pictures of people wearing the products, uh, the pictures of the different products, the kind of the, the highlights of the products that, that we have. Let's just add some accessories as well in the home page. Um, Add something regarding that you can come and visit us at our address is 57 Broadway in New Haven, Connecticut. So the, the, the main thing is that we don't have to copy the original style text of these pages. And then think about the following. On the products page, uh, we need to show the product images from the catalog, okay? So we're gonna have to be using the image paths in the database with the basic product info. So name, price, short description. I also want to be able to filter the products by name, price, uh, the color, sizes, etc. Each product should be um, should open if if you click on them should be able to open a single item page, where you can see on one side the large image of the, this product, the full product text on the other side with the description, the size, the price, the stock. If you have, if we have it, um, and yeah, so clicking on this card on the product should take our clients there. Apart from that, I also want a chat interface in the bottom right of the site. It should be kind of a floating chat panel. It doesn't have to talk to the agent. Um, yet, it's just we're going to add the back end to that later. And start with a simple fast API app in the back end called backend slash main.pi, just in order to help the products and images. And then we'll grow it into the agent back end later on. For doing this, I want you to have at least one or two agents for building it. And then I want one agent that will be able to review the work before kind of it is actually, um, yeah, after it is done.

### Follow-up prompt

> Perfect. As part of this problem, add the following schedule. Uh, Monday to Friday from 9.30 a.m. to 9 p.m. Saturday from 9.30 a.m. also to 9 p.m. And Sunday from 10 a.m. to 6 p.m. Then we'll start working on problem number four, which is called create account and login, and I'll give you the prompt for that.

---

### Follow-up prompt

> Perfect. Now we'll go back pretty quickly to the problem number three. Because every time I go into the website, and I go to the section of shop favorites, pieces we can't keep on the shelf, and I kind of keep going down, it makes a weird zoom that every, it makes zoom and zooms in and zooms in. And it's pretty weird. So change that. And add this as part of the problem number three prompts.

---

## Problem 4: Create Account and Login

### Prompt 1 (my own words)

> Nice. So for the problem number four, uh, we need to create a um, normal create account slash login flow. So I imagine this under the login section, we should create first the option to log in if people don't have the account. So putting in their email, putting in their password, and under that having the are you new tool custom Compass Customs or kind of something, add something regarding Handsome Dan. Like, new member of the Handsome Dan family or something like that. Make it creative. And then if you press that, we'll give them the option to create an account, putting in their name, their email, We'll probably also add their uh, phone number and password. I want the passwords to be um, secure. So add that they should create a uh, more than nine characters password, at least using one number when and a symbol. Don't let them use commonly word kind of common passwords, neither their name, neither their phone number, neither the their ad, their email address. Um, new accounts should go into the users table. The password should be saved uh, securely. And then just we'll after that we'll just confirm whether we can log in as users. Um, and that a new brand new account also that I'll be creating also works. Don't create this yet. So after this, after you finish this, I'll go ahead and open the website. You'll help me with that. I'll kind of open the front end and I'll try this out in terms of whether the the account creation and the the account the existing account already works.

### Follow-up prompt

> Okay, you can have more builders work at the same time. Um, if you need, try to implement a swarm of agents. If it's needed, in terms of you have a boss agent and then a few other workers that can divide the work um, and that the boss can delegate them. Make sure they can talk within each other um, so that we can make everything run more efficient and faster. if it's needed in terms of you have a boss agent and then a few other workers that can divide the work um, and that the boss can delegate them. Make sure that they can talk within each other um, so that we can make everything run more efficient and faster.

### Follow-up prompt

> Okay, in terms of hashing setting, just use a normal hashing setting. I don't, don't have any specific. And the test account that should be able to log in now is the one that is already saved under users in the database. So I should be able to sign in with that, make this part of problem number four.

### Follow-up prompt

> No. Um, let's make something. Let the test at campuscustoms.yale.edu access with their with the password that is saved on the data set. Make that possible also for Ada and Tauhid And once, if let's add to the website that if their password is old and isn't saved via the hash, so it isn't secure, we'll let them know, hey, this password isn't secure, please update it.

### Follow-up prompt

> Okay, but in the case of Tawit and Ada, if those passwords are hashed, then how would this work?

### Follow-up prompt

> I still can't access my test at campus customs.yale.edu. account. And that info should be saved in the database.

### Follow-up prompt

> perfect - it worked. So Tauhid's and Ada's password are working right and were not changed?

---

## Problem 5: Pydantic AI Agent Backend

### Prompt 1 (my own words)

> Now we'll work on problem number five called Pydantic AI Agent Backend. Pydantic AI goes together. Um, so we'll be building the shop chatbot as a Pydantic um, AI agent. using the port key API key that we have and behind a fast API. This should be plugged into our front end and our website using the chat widget. And this should be saved um, in the backend slash main.py because this is the file uh, we run with Ubicorn. The agent should have four files. Um, first, the backend slash prompts slash prompts.md, which will have the system prompts. We'll be growing this later. Then the backend slash agent.pi, which is the agent entry slash wiring, the backend slash tools.pi, which will be saving the tools that the agent can call and use. And then backend slash models.pi, which will have the structure types. that the agent will be using. In the document main.pi, we'll have a chat route so that a message from the website returns a response from the agent. Um, I will be using our API key, as I said. We'll be using custom campus customs voice. Uh, the agent should be called Tansen Dan, of course. And the safety basics add them into the prompt slash prompt dot md. And we'll be starting or updating the types in models.pi for the chat replies, uh, the product cards as we go along. And finally, in output slash harness.md, we'll just explain how the front end talks to the fast API backend and how the agent is actually loaded. So using prompt five slash the model. After that, we'll make sure that the backend runs. Um, And just add some additional safety check. The AI agent should only be able to answer questions regarding the website itself. Um, and things related to the website, just make sure that people are not able to use that to just access the API key.

---

## Problem 6: Tools — Product Info and Stock

### Prompt 1 (my own words)

> Okay, now we'll be working in problem number six. Called tools double point product info and stock. Um, now we'll be giving the agent uh, the tools that should be saved in the tools.pi document. Um, and they should be able to look up the information from the compass. Um, underscore customs dot db document. Specifically, the product description, the price, how many are in stock, the sizes, the colors, and every single type of information that um, are saved in the database. But it should never invent prices, quantities, um, should never invent information. Because the database should be kind of will be updated. And it shouldn't. And if there's no if a size is out of stock, it should kind of say that. And then we'll be working on the problem slash prompt dot md document, um, so that the agent knows that it has to call those specific tools for price and stock questions. And also we'll be adding the return types in the models.pi document. Expand on this and help me out kind of working this out. And finally, in the output slash harness.md file, we'll be listing each tools and explaining which models which model fields Uh, I chose for lookup results and why. And you should be helping out with this. I want to understand it.

### Follow-up prompt

> yes fix that

### Follow-up prompt

> for faster with the reviewers. The problem I had with the images becoming larger is still happening. The agent is not called handsome dan and I dont see other changes. What is doing on

### Follow-up prompt

> Make the Chat floating thing a handsome dan and a bit bigger

---

## Problem 7: Chat Search That Updates the Page

### Prompt 1 (my own words)

> As to problem number seven, which is called chat search that updates the page. Uh, we'll be adding a new feature, which is pretty awesome, called um, chat search. And the idea is that every time a customer asks about a type of item, for example, hoodies, for example, what type of t-shirts do we have, the agent should be able to search throughout the whole catalog and the website should dynamically show only the matching products as product, product cards to the search that it did. And it should be able to show the image, the name, the price, and a short info. Uh, the agent will be returning structured products. So you, we should be able to save that info in the tools info, in the tools um, documents, uh, tools.pi, uh, types. In the models.pi as well. Um, because I mean it should be it should work like that. The agent returns structured matches of the products and then the front end renders them on the website. Apparently it's called an API contract. And after these product cards are dynamically loaded into our into our into our website, we'll need to make sure that this dynamic setting that we built in problem number three, that when you click one of the pictures or one of the cards, it opens up the um, detailed view of the product card. This should also be working. Finally, update the prompt slash prompt.md and the output harness.md so it is clear and we can actually see how search results reach the page. Again, add some safety features. It shouldn't never invent info. It should never um, search outside of the information that it is in the catalog and the website.

---

## Problem 8: Customer Memory

### Prompt 1 (my own words)

> As part of problem eight, it's called customer memory. We need to create something that will be saving the every customer's kind of data in the sense of their chat history in the database, in an appropriate table. Um, so we will do it in the following way. Every time a client signs into the signs into the website, um, the agent will know who actually is chatting with them. So the email, the name, and the um, the email, the name, and the other information that is saved in the profile, except of course their password. Um, This should be saved in a way that it is a clear pattern and that or and in tools that the agent can call. So we'll be creating a tool.pi will be also creating a structured type um, I want the chatbot to be able to use a name like hey welcome back test or welcome back yo um, and all of the information from the person should be saved in the database and it should be kind of know both the chat history so what they are kind of asking handsome Dan um and also the page context so for example if someone asks hey is this is this in my size um or is this in size x then the agent should know kind of the context that the person is asking the question in. So it is probably going to have to see and analyze the where in the page is the person currently at. Um, so we can put the code into the agent context for that matter. The um, chat will also be available for guests. which is not with saved memory. I want the um, handsome Dan, if a person who has looked for stuff before signs into the the website, it should be able kind of to pop out and say, hey, are you looking this again? Or want to buy this again? Um, and then we'll be documenting in output slash harness.md how actually the user chat history is stored customer fields that the agent sees and how the page context is passed. This is really important. Again, uh, there should be some security protocols behind that. It should be efficient um, and yeah.

---

## Problem 9: Usability and Security Improvements

### Prompt 1 (my own words)

> Great, now we're gonna be working in problem number one. We'll be implementing two usability improvements in the front end into um, back end slash agent improvements usability improvements. Um, so and I would also be adding a security feature. I want to create a system for recovering the passwords. So every time a new password is created, Um, you should be able to receive some security codes that will be used in order to reset the password. So create that function. Uh, those security codes should be saved by the user and then you can only reset your password using your email one of those codes and entering a new password. In terms of the um, agent slash backend usability improvements, I'm thinking about doing the following. Um, the first will be improving the search. Both across the chatbot and across the um, the search function in the product slide. For that case, I want I wanted to be as follows. So people may write incorrectly. People may write with mistakes. So the search function has to be more useful. So if I write hoodies with a double D, it should understand that I'm referring to hoodies with one D and two O's. If I'm saying that I want a pink something pink, it should be able to understand that maybe something in color coral. is what I'm looking for. So I want to make the agent uh, work faster and I also want and I think this will be the second usability improvement let's think together if these are two I also want the search mainly when I'm doing it in the search box of the product section I want it to be more dynamic. So as I'm writing stuff, it should be updating. Every time I write a letter, it should update. Those are going to be my two well, I'll I also want to add one. So make those two as one. And I will also add some security features um and some features to kind of make the agent run faster or cheaper. Um, and safer. Uh, so I've got some safety features already included before. Um, let's try to encrypt the data. And the chatbot. The um, the data that is saved. In the in the databases regarding the searches that people do with the chatbot, let's try to make those. In, let's try to encrypt that um, let's think about how we can do that and then in terms of usability improvements um, First, I want to be able to do a phone app. So this should also be working just make sure that this works as in your cell phone. Uh, those that won't be part of it, but just make sure that this exists. I want to make the website more dynamic. So Think of the Apple.com website. Whereas you're moving to the bottom of the website, new things start to appear. So that is going to be one of the front end usability things. Together with creating a uh, dark mode for the website, make sure that every color is seeable and the text is seeable. So check that out. Also change the custom the campus customs logo just there's a an attempt of a handsome Dan in the top of the web of the website that's not handsome Dan so change that um and change like I'm not able to see add another sub page which is kind of my profile and in your profile you're going to be able to see all of the searches that you've done, all the products that you've seen, all of the purchases that you've done, um, yeah. And think about what else we could do. Give me ideas and we'll go over them to see if we can implement them. While you work on the ideas we should also be working on an output slash usability md document to explain the improvements that we added and why it could help campus customs shoppers or the business itself thanks. 

### Follow-up prompt

> load it onto the site

### Follow-up prompt

> keep local, but the update is not showing up for example my profile

### Follow-up prompt

> At the back plus the test mode checkout, um, I want to be able to see that go through bit stop at the moment where kind of you have to pay because I don't want to add that now. But yeah, just add that as a new feature. Um, and the wish list, I also want that. Those could be seen in my profile as well. Um, And I guess that those with these should be like two backends and two front ends, front end new features. Um, in output slash usability, add these. Um, we should be able to add the improvements as what I added and why it helps a compass custom shopper or the business. We need to make sure that all improvements actually show up in the app. Um, and yes.

---

## Problem 10: Style the Website

### Prompt 1 (my own words)

> Okay, so now we're gonna be working in problem 10, which is called style the website. We need to add creative designs to the website. Um, fonts, colors, in the product presentation, um, pictures, of the Yale campus that is something that I really want to use um and I want to make it in a way that depending on the on the season whether it's winter summer autumn or fall spring or fall we get different uh pictures of the campus of the Yale campus in New Haven all around so you can kind of see that and that it would also recommend to certain items depending on the season. Um, also, in the chat, add certain stuff more about Handsome Dan, um, try to create some pictures of people actually wearing those um, items that we have in the product line. I know you can do it so add create those, add those, add some motion in the in the website. Um, It just kind of make it nicer, feel more modern with those pictures from Yale. Let's work on that. And we'll get back later. And we also should write the output slash design.md. Explaining what we change, um, and why it should customers stick around and buy it. Uh, this should be concrete and short. But it lets apply this and then let's um, think of more ideas that we could apply.

### Follow-up prompt

> Worker H - Work faster. Sprint

### Follow-up prompt

> put it online

### Follow-up prompt

> Don't put it public. Fix this spot. Did you add everything to the desgin.md?

---

## Problem 11: Site Testing (App Check)

### Prompt 1 (my own words)

> Okay, so now as part of problem 11, we'll be let us call it site testing in parentheses app check. Uh, we'll be testing the live site and document it for that we need to create an HTML document that is under output slash app underscore check. Um, where we can just double click and open it. We're going to have to include include uh, screenshots and captions for a checking the inventory level b checking that the dynamic search results cards actually appear after after a category question for example hoodies and also one of the usability features that we added in problem number nine We need to make sure that there's a heading for each check at the HTML document. One screenshot, two or one or two sentences, and what the screenshot proves. The screenshot images uh, should be filed under the output slash app underscore check underscore images. Um, and should be linked from app underscore check dot HTML. with relatives path with relative paths um how should i how do you think should i approach this could you take the screenshots and work on this or should i first take the screenshots before doing anything just tell me what should we how should we approach it

### Follow-up prompt

> Go ahead

### Follow-up prompt

> I don't see the screenshots on the html

### Follow-up prompt

> Eliminate the notes from the bottom of the html

---

## Problem 12: Audit Trail, Safety and Finish Harness

### Prompt 1 (my own words)

> In the meantime, um, create some other workers that will be working in problem 12, which is called audit trail safety and finish harness. We need to create um, an append only JSON file, which is called our, our output slash audit underscore trail dot JSON, just to record the agent loop activity. So the time, the tool name, the short arguments, the result, and the stop reason for the use of that specific uh, agent. This should be kept at all times, no type of, um, it should never be erased. And we'll be also kind of giving the agent some safety rules. Um, I've already added some of these previously, but let's let's think of those. So, for example, I don't want the agent to go outside of the website. Uh, it should never give any private information, even if the same user is asking the address, for example, it shouldn't, it shouldn't give it out loud, um, never give information about other users. Let's also add that it should never invent any type of information, only use reliable info. If someone's, someone asks about the identity of someone, should never give it out loud. In terms of safety, there should be a token limit so that people don't abuse it. Um, And let's add other similar safety features um, that you can think of.

### Follow-up prompt

> as part of problem 12, also just make sure that the output slash harness.md file is uh, really specific and clear on how the system actually works. Um, in other things, it should kind of read as a whole document, should include all of the model fields in models.py, why I chose them, the tools, the abilities, the, all of the safety rules that we included throughout this kind of process, not only the ones from the uh, last problem, but every single one. And then the specs, kind of the loop, the loop limits, the result caps, the models, how to run front and back. Um, and also part of this part of this safety issue let's just add some loop limits to the agent the um, result caps and and everything um just to try to make the model kind of efficient and cheap and yes uh let me know when this is done and we'll go to the last problem which is problem number 13

---

## Problem 13: Push to GitHub and Submit the URL

### Prompt 1 (my own words)

> As part of problem 13, which is called push to GitHub and submit the URL, um, take into account the following structure. Um, we need to create a folder name HW4, push this to a public GitHub uh, repository, don't use a the repository from the network networking tracker, use another one. Um, do not pull my real.env neither the campus customs.db or the product images in the GitHub repo. Just use gitignore it use gitignore include.env.example with placeholders only but make sure that you can that the pictures that I added of the Yale campus make sure that those are kind of uploaded and yeah the readme.md should explain how to run the front and back end after placing the data pack um the agent itself should be under the um the files that says in the structure and The screenshot should be there. So yeah.

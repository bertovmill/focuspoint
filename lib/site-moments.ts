/**
 * Photos from my LinkedIn posts, shown in the homepage carousel. Each one keeps the
 * post it came from so a visitor can open the story behind the photo. Images live in
 * public/site-art (as moment-<slug>.webp); dates are the month the post went up.
 */
export type Moment = {
  slug: string;
  title: string;
  place: string;
  /** YYYY-MM */
  date: string;
  src: string;
  width: number;
  height: number;
  /** The LinkedIn post text, as written. */
  post: string;
};

export const MOMENTS: Moment[] = [
  {
    slug: "innovation-roundtable-paris-aucctus",
    title: "Presenting Aucctus at the Innovation Roundtable",
    place: "Paris",
    date: "2026-06",
    src: "/site-art/moment-innovation-roundtable-paris-aucctus.webp",
    width: 1600,
    height: 1200,
    post: 'Last week, Vincent Atallah and I travelled to the Innovation Roundtable® in Paris to present Aucctus AI, and the experience was inspiring.\n\nIn 2 days full of presentations from EDF, EPFL, IKEA, Signify, Philips, ZF Group, IBM, and more, the event brought together leaders exploring AI-powered innovation, synthetic personas, and new approaches to design and decision-making.\n\nOne of my major takeaways was that innovation today is blurring industry boundaries:\n- a mobile phone company can go into autonomous vehicles\n- an automotive company can go into grocery delivery\n\nIt is key to constantly reimagine the definition of what 𝐚𝐫𝐞𝐧𝐚 your company plays in. An example is Uber which has the broad mission "to reimagine the way the world moves for the better."\n\nFor a fantastic write-up on the event, check out this article by Maarten Korz, who also presented at the event: \n\nI want to extend a huge thank you to Axel Rosenø and the team for putting on an exceptionally insightful and smoothly-ran event.  As someone who runs innovation events, this set the bar for events I\'d like to hold in the future!\n\nVery excited for the upcoming Innovation Roundtable® in Copenhagen!',
  },
  {
    slug: "innovation-roundtable-paris-talk",
    title: "On stage at the Innovation Roundtable",
    place: "Paris",
    date: "2026-06",
    src: "/site-art/moment-innovation-roundtable-paris-talk.webp",
    width: 1600,
    height: 1066,
    post: 'Last week, Vincent Atallah and I travelled to the Innovation Roundtable® in Paris to present Aucctus AI, and the experience was inspiring.\n\nIn 2 days full of presentations from EDF, EPFL, IKEA, Signify, Philips, ZF Group, IBM, and more, the event brought together leaders exploring AI-powered innovation, synthetic personas, and new approaches to design and decision-making.\n\nOne of my major takeaways was that innovation today is blurring industry boundaries:\n- a mobile phone company can go into autonomous vehicles\n- an automotive company can go into grocery delivery\n\nIt is key to constantly reimagine the definition of what 𝐚𝐫𝐞𝐧𝐚 your company plays in. An example is Uber which has the broad mission "to reimagine the way the world moves for the better."\n\nFor a fantastic write-up on the event, check out this article by Maarten Korz, who also presented at the event: \n\nI want to extend a huge thank you to Axel Rosenø and the team for putting on an exceptionally insightful and smoothly-ran event.  As someone who runs innovation events, this set the bar for events I\'d like to hold in the future!\n\nVery excited for the upcoming Innovation Roundtable® in Copenhagen!',
  },
  {
    slug: "innovation-roundtable-paris-table",
    title: "Roundtable with corporate innovation leaders",
    place: "Paris",
    date: "2026-06",
    src: "/site-art/moment-innovation-roundtable-paris-table.webp",
    width: 1600,
    height: 1066,
    post: 'Last week, Vincent Atallah and I travelled to the Innovation Roundtable® in Paris to present Aucctus AI, and the experience was inspiring.\n\nIn 2 days full of presentations from EDF, EPFL, IKEA, Signify, Philips, ZF Group, IBM, and more, the event brought together leaders exploring AI-powered innovation, synthetic personas, and new approaches to design and decision-making.\n\nOne of my major takeaways was that innovation today is blurring industry boundaries:\n- a mobile phone company can go into autonomous vehicles\n- an automotive company can go into grocery delivery\n\nIt is key to constantly reimagine the definition of what 𝐚𝐫𝐞𝐧𝐚 your company plays in. An example is Uber which has the broad mission "to reimagine the way the world moves for the better."\n\nFor a fantastic write-up on the event, check out this article by Maarten Korz, who also presented at the event: \n\nI want to extend a huge thank you to Axel Rosenø and the team for putting on an exceptionally insightful and smoothly-ran event.  As someone who runs innovation events, this set the bar for events I\'d like to hold in the future!\n\nVery excited for the upcoming Innovation Roundtable® in Copenhagen!',
  },
  {
    slug: "impact-2026-cambridge",
    title: "Impact 2026, sponsored by Aucctus",
    place: "Cambridge, MA",
    date: "2026-07",
    src: "/site-art/moment-impact-2026-cambridge.webp",
    width: 1023,
    height: 682,
    post: "What a few days in Cambridge. 🎉\n\nImpact 2026 wrapped up this week, and I'm still processing all the conversations. Aucctus AI was proud to sponsor this year's event, and InnoLead delivered once again.\n\nThree days of honest, off-the-record conversations with the people actually driving innovation inside large organizations, from AI strategy to startup partnerships to doing more with less.\n\nWhat stood out most: the openness. Innovation leaders sharing what's working, what isn't, and what they're betting on next. That kind of candor is rare, and it's why this community keeps showing up.\n\nHuge thank you to the InnoLead team for putting together the most practical corporate innovation event out there. Already looking forward to the next one.\nIf we crossed paths at Impact, let's keep the conversation going. 👇",
  },
  {
    slug: "ai-friends-8-talk",
    title: "Speaking at AI Friends #8",
    place: "Toronto",
    date: "2025-12",
    src: "/site-art/moment-ai-friends-8-talk.webp",
    width: 1600,
    height: 1066,
    post: "What a night at AI Friends #8  put on  by Maple Leaf Venture Club 🤖🫶\n\nAI Friends was one of the first community events I attended when I moved to Toronto. Watching it grow into what it is now has been incredible to witness. Huge shoutout to Wendy Huang and Mischa Hamara for organizing the event, and thank you to NEXT Canada for hosting, it's a great venue that attracts some of the best talent in AI.\n\nI had the chance to share my story and present on MakersLounge, a community I started with 5 people at a coffee shop. Today we're at 350+ members: founders, artists, developers all building together.\nCommunity has been a major source of my progress. It enabled me to showcase my projects, find amazing people to collaborate with, and learn from the projects of others. So naturally, I built AI into how we run MakersLounge, including a Maker matching tool that helps connect the right people at our events.\n\nExtra special to have my brother David Mill there. He made the trip up from Windsor and is building something amazing himself with SCELTA!\n\nIf you're in Toronto and looking for a community of people who actually build things together, come check out MakersLounge. And if you haven't been to an AI Friends event yet, would love to see you out there!",
  },
  {
    slug: "ai-friends-8-conversation",
    title: "After the talk at AI Friends #8",
    place: "Toronto",
    date: "2025-12",
    src: "/site-art/moment-ai-friends-8-conversation.webp",
    width: 1600,
    height: 1066,
    post: "What a night at AI Friends #8  put on  by Maple Leaf Venture Club 🤖🫶\n\nAI Friends was one of the first community events I attended when I moved to Toronto. Watching it grow into what it is now has been incredible to witness. Huge shoutout to Wendy Huang and Mischa Hamara for organizing the event, and thank you to NEXT Canada for hosting, it's a great venue that attracts some of the best talent in AI.\n\nI had the chance to share my story and present on MakersLounge, a community I started with 5 people at a coffee shop. Today we're at 350+ members: founders, artists, developers all building together.\nCommunity has been a major source of my progress. It enabled me to showcase my projects, find amazing people to collaborate with, and learn from the projects of others. So naturally, I built AI into how we run MakersLounge, including a Maker matching tool that helps connect the right people at our events.\n\nExtra special to have my brother David Mill there. He made the trip up from Windsor and is building something amazing himself with SCELTA!\n\nIf you're in Toronto and looking for a community of people who actually build things together, come check out MakersLounge. And if you haven't been to an AI Friends event yet, would love to see you out there!",
  },
  {
    slug: "makerslounge-4-hosting",
    title: "Hosting MakersLounge #4",
    place: "Toronto",
    date: "2025-12",
    src: "/site-art/moment-makerslounge-4-hosting.webp",
    width: 1600,
    height: 1066,
    post: "MakersLounge #4 was another successful event, bringing together a strong community of artists, designers, developers, and builders together to make something impactful for the city of Toronto.\n\nWe used an AI intake form that created teams based on similar interest and within minutes the teams were off to the races making incredible projects.\n\nI was blown away by how fast the community could build impactful solutions - like a city bike mobile app or a wellness community event app.\n\nWe’re all going to come together at the end of the month to share what we have built and continue to celebrate each others efforts and creativity.\n\nA huge thank you to New Stadium for hosting this incredible event. They are truly inspiring a wave of brilliant makers impacting our communities!",
  },
  {
    slug: "hackai-toronto-group",
    title: "HackAI Toronto, final day",
    place: "Toronto",
    date: "2026-02",
    src: "/site-art/moment-hackai-toronto-group.webp",
    width: 1600,
    height: 1066,
    post: "What a fantastic finish to an incredible weekend-long event!\n\nHackAI Toronto was the best hackathon i've ever attended. The whole Stan team's attention to every detail made the experience incredible, from personal handwritten notes to every builder, incredible food, and developer credit cards. A huge thank you to Vitalii Dodonov, Esther Wang, Emily Talas and the rest of the team for organizing this event.\n\nI built https://www.snipeditor.com, an AI video editor that connects to your social accounts so the AI agent can analyze your top-performing posts and help you create new videos with that context in mind. It also has a voice agent that lets you make edits just by talking to it. I learned a ton and I'm genuinely proud of what I shipped in 48 hours.\n\nBut beyond the building - the late nights and long days with everyone created real friendships fast. Shoutout to Ameen Neami who sat next to me for nearly the entire 48 hours and took second place. Watching him work was inspiring (the guy was cooking!)\n\nThe 6 finalist presentations were mind-blowing - they were market-ready products built in a weekend. The $20,000 winners absolutely deserved it.\n\nThis was only Stan's second hackathon. I can't wait to see what they do next for Toronto's builder community.",
  },
  {
    slug: "hackai-toronto-day-1",
    title: "Day 1 at HackAI Toronto",
    place: "Toronto",
    date: "2026-02",
    src: "/site-art/moment-hackai-toronto-day-1.webp",
    width: 1152,
    height: 1536,
    post: "Day 1 at the Stan HackAI Toronto hackathon just kicked off. It's amazing to be around some of the best AI developers and build alongside them.\n\nIn university, the path I saw for myself was getting a business degree and going into finance or consulting. I didn't even imagine software development or content creation as an option for me.\n\nBut soon into my career working at a bank, I felt a strong motivation to start making things that I was passionate about. I was teaching myself to code on the side and making some content, but it was really daunting at first and I felt like I was making no progress.\n\nIt wasn't until I found communities like AI Tinkerers and Builder Sundays that I gained confidence through sharing my work.\n\nWhich is why I started MakersLounge last year, a community of now over 500 passionate makers in Toronto trying to make something great - because it's hard to bring something new into the world, and community is extremely helpful.\n\nStan embodies that same philosophy - giving anyone the tools and opportunities to make things for others and build a career for themselves.\n\nThis weekend I hope to showcase the tools I can contribute to the maker community, as well as my passion for supporting people trying to make something great.\n\nBecoming a 'maker' - taking a bet on oneself and finding a way to contribute is one of the most rewarding experiences, and I hope to create a tool this weekend that helps others take that same leap.\n\nThank you Vitalii Dodonov, Esther Wang, James Cao for organizing the event!",
  },
  {
    slug: "kpmg-future-on-orlando",
    title: "Presenting at KPMG Future On",
    place: "Orlando",
    date: "2026-01",
    src: "/site-art/moment-kpmg-future-on-orlando.webp",
    width: 1152,
    height: 1536,
    post: "This past month I had the opportunity to present at KPMG's Future On conference at Lakehouse in Orlando, Florida.\n\nOur team showcased the latest AI tools we've been building in the tax space — solutions designed to augment how professionals work, not replace what makes them valuable.\n\nThe theme of the event was \"Future On\" — think forward, be brave. And that message resonated throughout every session. The conversations weren't about whether AI will transform our industry. They were about how we prepare for it now.\nWhat stood out most was the energy in the room. Teams from across the firm sharing what they're building, learning from each other, and pushing the boundaries of what's possible.\n\nAI isn't a future conversation anymore. It's here, and it's moving fast. The organizations and professionals who lean in now — who experiment, adapt, and build — will be the ones ready when it matters.\n\nGrateful for the chance to contribute and connect with so many talented colleagues.",
  },
  {
    slug: "kpmg-future-on-team",
    title: "The KPMG Ignition team at Future On",
    place: "Orlando",
    date: "2026-01",
    src: "/site-art/moment-kpmg-future-on-team.webp",
    width: 1600,
    height: 1200,
    post: "This past month I had the opportunity to present at KPMG's Future On conference at Lakehouse in Orlando, Florida.\n\nOur team showcased the latest AI tools we've been building in the tax space — solutions designed to augment how professionals work, not replace what makes them valuable.\n\nThe theme of the event was \"Future On\" — think forward, be brave. And that message resonated throughout every session. The conversations weren't about whether AI will transform our industry. They were about how we prepare for it now.\nWhat stood out most was the energy in the room. Teams from across the firm sharing what they're building, learning from each other, and pushing the boundaries of what's possible.\n\nAI isn't a future conversation anymore. It's here, and it's moving fast. The organizations and professionals who lean in now — who experiment, adapt, and build — will be the ones ready when it matters.\n\nGrateful for the chance to contribute and connect with so many talented colleagues.",
  },
  {
    slug: "kpmg-ai-workshops",
    title: "Leading AI workshops for KPMG Tax",
    place: "Toronto",
    date: "2026-02",
    src: "/site-art/moment-kpmg-ai-workshops.webp",
    width: 1163,
    height: 698,
    post: "I had a great opportunity over the last 2 weeks to lead 25+ AI training workshops for Tax professionals ranging from partner to associate level across 4 Canadian geographies.\n\nOver the workshops, I learned to present with greater focus on the audiences coming away with practical skills, rather that just showcasing powerful AI tools. For me, this meant undulating the presentation pace, asking more questions, and enabling the audience be active dicsussion participants.\n\nShout out to my great team Daniel Oginni, Victoria Sivitilli, MBA, Himanshu Puri, Amrita Persaud , Ailya Jaffry and Camelia Bouthillier for working together so seamlessly through technical and logistic challenges that came up throughout the trip.",
  },
  {
    slug: "kpmg-digital-gateway-amsterdam",
    title: "Digital Gateway GenAI conference",
    place: "Amsterdam",
    date: "2025-12",
    src: "/site-art/moment-kpmg-digital-gateway-amsterdam.webp",
    width: 1600,
    height: 1200,
    post: "KPMG Ignition team at the Digital Gateway GenAI conference in Amsterdam🇳🇱\nAmrita Persaud Mahima Kumar\n\nGreat to see the developments from all the different member firms on their AI journies!",
  },
  {
    slug: "ivey-msc-talk",
    title: "Speaking to the Ivey MSc class of 2026",
    place: "London, ON",
    date: "2025-09",
    src: "/site-art/moment-ivey-msc-talk.webp",
    width: 1170,
    height: 1531,
    post: "Yesterday marked a special day in my career. First, I started in my role as AI Go-to-Market consultant on the KPMG Ignition Tax team.\n\nI was also invited to come back to my alma mater, Ivey Business School, where I had the opportunity to share my experience with the incoming MSc class of 2026. I’m very excited to see the program evolve and all of the talented students starting their journeys.\n\nI’m very grateful for my colleagues from CIBC and the enterprise innovation team who taught me so many valuable lessons and skills, along with great memories and friendships.\n\nVery excited to continue to build and provide solutions in this fast paced AI environment!",
  },
];

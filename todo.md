#todo

* [x] look at the the schema.md file represents a post in this blog. 
    it has the meta data fields and then it has a short paragraph to begin with and a number of paragraphs underneath it
    the short paragraph is for the front page, the other paragraphs are for the post page
* [x] see if you can make a json schema describing the schema.md
* [x] make a simple minimal single collumn jekyll blog around the schema described before as posts
* [x] make a sign in with github cms way of editing the posts directly inplace in the blog and a way of doing the same locally in a dev server
* [x] add a way to make a new post in the cms (both online and local)
* [x] go to ../supernihil/_posts/ and find all markdown files where meta field hidden is false, then turn them into posts using our schema, then import their cover's using the path in their media field
* [x] make 3 new pages: 
    * statiske værker: a list of all static creations like videos, websites, etc
    * levende værker: a list of all works/events/performances that were live
    * info: contact information
* [x] change the schema to add a type: static or live to match the 2 new pages
* [x] implement a very simple layout similar to https://arambartholl.com
* [x] change the frontpage to be a massive scrolling fullwidth image gallery of all works ordered by date exactly like https://arambartholl.com
* [x] make a design.md file with an analysis of the structure and css of https://arambartholl.com 
* [x] implement the design.md ideas in this blog
* [x] the design of our blog is not spanning the whole width of the window explain why that is
* [x] fix the width issue
* [x] remove the vertical gap between frontpage posts and overlay the post info on top of the post in its lower left corner, increase the visibility of that overlaid text as well
* [x] all overlaid metadata should be in lower left corner of each frontpage post, both title, category, date and type. and increase the font size 
* [x] frontpage: all metadata should be in lower left of each post
* [x] crop the size of each post so one post can fit in the windows height including its metadata
* [x] make the edges of frontpage posts blend together vertically
* [x] increase font size of nav bar items and make the navbar sticky plus remove the space between the navbar and the the content
* [x] analyze typography as on https://arambartholl.com and update the design.md and implement it on this blog
* [x] implement lazy loading of images
* [x] make a layout for static and live pages where there is a fixed column size and a dynamic responsive amounts of columns on the page and inside each column the individual rows can be sized to their content
* [x] on static and live pages, make sure the ordering of posts is newest in top left corner and oldest in lower right corner
* [x] make sure all post sorting is based on the date field in the metadata and not the filename, this should be made sure everywhere
* [x] make sure the ordering in the static and live pages are like this example:
  2026 2026 2026 2025
  2025 2025 2024 2024 
  2024 2022
* [x] make sure the static and live pages have dynamic amounts of collumns and that inside the columns the rows are organized per column according to their height. we dont want any white space except padding and margins etc
* [x] make sure the typography is responsive
* [x] max size of the frontpage post font should be reduced 
* [x] make a da/en language switch and add fields to the post schema for english versions of texts
* [x] make english translations of the site and all the posts and make the language toggle toggle between them, also make sure that the interface and all categories etc are as well available in danish and english versions including all stuff like "static" and "code" and "performance" etc  and make a place where i can edit the names of all those translation strings
* [x] the navbar only works in danish, fix it
* [x] the posts dont have visible english descriptions
* [x] change font family to the 'Inter', sans-serif
* [x] add a filter to all post images in frontpage where there is introduced gritty noise and its only "black and red" (like black and white but with red instead, so not binary but grey tones in black to red)
* [x] increase brightness and contrast a bit in the frontpage post image filter
* [x] the blend between the frontpage posts are increasing brightness, it looks stupid
* [x] make sure the images when you are in a post view, are always visible in their totality without scrolling
* [x] make sure the images in post view are scaled to a height so that the image fills the full height without being cropped
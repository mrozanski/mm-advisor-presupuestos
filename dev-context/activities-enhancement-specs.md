# Activities Enhancement Specs

## List should come from a predefined list

New requirement for this little app (a JS eabled tour estimates generator).
Currently, the logic that is triggered when index.html loads, fetches from Google Sheets API and uses the returned data to populate the page. The retrieved data consists in a list of activities, number of passengers, prices and dates.
What we need to add now from the admin user perspective is support for a predefined list of activities (right now they use the spreadsheet to type free text for their names). What I plan to do is modify the Google Sheet they use so the cells for the activities are a drop down with a list of activity names (about 50 in total).

## Custom activities

The admin user should be able to add custom one-off activities to the list. These activities will not come from the predefined list, but be typed in by the user.

## Optional URLS for activities

In addition to that, we need to support optional URLS for activities, so if an activity has an URL, the page we render here should display a link to the activity.
My plan so far is to have a new column in the Google Sheet, named "URL". But URLs should be transparent to most admin use cases, unless they're adding a custom one. My options for that are
A) If Google Sheets supports this out of the box, (I prefer to avoid Apps Scripts) a hidden column with the URLs would be added to the data we fetch here, and if possible, I'll configure the sheet to add the URL next to the activity name cell, pulling from another predefined list the corresponding values depending on each activity selected.

If this is not possible without Apps Scripts, we have a few options:

B) A second sheet that contains the activities list plus their URLs, that this app can fetch from in a second request, and then string match the activity name to the URL from there.

C) Another option is to do the same as above but always include the URLs list range in the initial request to save one trip to the server.

D) If no other option is possible, we can use Apps Scripts to add the URLs to the activities list and include them in the range this app does initially.

What we should avoiod is having any of these values baked in to this app, because that limits the admin user's ability to modify the data. (They shoud eb able to add, remove and modify activities and their URLs from Google Sheets without updating this web app)
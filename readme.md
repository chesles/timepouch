# timepouch

`timepouch` is a command-line time tracking utility made with [node.js](http://nodejs.org) and [PouchDB](http://pouchdb.com). It was inspired by [timetrap](https://github.com/samg/timetrap). `timepouch` improves on timetrap by using a database that can very easily sync with CouchDB.

## Getting Started

    npm install -g timepouch

## Basic Usage

    $ timepouch --help
    Options:
      -d, --display  Display checkins for the current sheet
      -s, --sheet    Select or create a sheet              
      -l, --list     Display timesheets                    
      -i, --in       Check in to the current timesheet
      -o, --out      Check out of the current timesheet
      --sync [url]   Sync changes with the CouchDB server at url


# TODO

- Build a web interface to make syncing with a CouchDB useful
- Improve output formatting and reporting
- Add editing
- Add ability to specify start and end times

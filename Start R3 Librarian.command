#!/bin/zsh
# Double-click this file to start the R3 Librarian. Close this window to stop it.
cd "$(dirname "$0")/app"

# First run only: download React and Vite
[ -d node_modules ] || npm install

# Open Chrome once the app has had a couple of seconds to start
(sleep 2 && open -a "Google Chrome" "http://localhost:8642") &
npm run dev

#!/bin/sh
# shot.sh page.html out.png [w h]: a headless-Chrome screenshot of a viewer page (software WebGL)
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
timeout 90 "$CH" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=${3:-1400},${4:-1000} \
  --virtual-time-budget=10000 --user-data-dir="${TMPDIR:-/tmp}/lidar_shot_chrome" --screenshot="$2" "file://$(cd "$(dirname "$1")" && pwd)/$(basename "$1")" >/dev/null 2>&1

#!/bin/zsh
# In-game fold verification: drive to a target trackDist and screenshot.
# usage: lapshot.sh <trackIdx> <trackId> <targetDist> <shotName> [timeoutSec]
set -e
IDX=$1; TID=$2; TARGET=$3; NAME=$4; TIMEOUT=${5:-90}
agent-browser eval "__race2.start($IDX), 'started'" > /dev/null
agent-browser eval "__race2.auto(true)" > /dev/null
agent-browser eval "__race2.skipCountdown(), 'go'" > /dev/null
START=$(date +%s)
while true; do
  NOW=$(date +%s); ELAPSED=$((NOW-START))
  if [ $ELAPSED -gt $TIMEOUT ]; then echo "TIMEOUT $TID@$TARGET"; break; fi
  DIST=$(agent-browser eval "JSON.stringify({d:__race2.state().trackDist,ph:__race2.state().phase})" | tr -d '"')
  D=$(echo "$DIST" | sed -n 's/.*d:\([0-9]*\).*/\1/p')
  if [ -n "$D" ]; then
    DIFF=$((D-TARGET))
    ADIFF=${DIFF#-}
    if [ $ADIFF -le 12 ]; then
      sleep 0.15
      agent-browser screenshot "qa/v7-phase5/laps/$NAME.png" > /dev/null
      echo "SHOT $TID@$D -> $NAME.png"
      break
    fi
  fi
  sleep 0.4
done

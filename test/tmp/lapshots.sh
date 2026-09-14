#!/bin/zsh
# One autopilot lap per track; screenshot at each target dist (comma list).
# usage: lapshots.sh <trackIdx> <trackId> <dist1,dist2,...> <tag>
set -e
IDX=$1; TID=$2; TARGETS=$3; TAG=$4
agent-browser eval "__race2.start($IDX), 'started'" > /dev/null
agent-browser eval "__race2.auto(true)" > /dev/null
agent-browser eval "__race2.skipCountdown(), 'go'" > /dev/null
declare -A pend
for t in $(echo "$TARGETS" | tr ',' ' '); do pend[$t]=1; done
START=$(date +%s)
LAPLEN=$(agent-browser eval "__race2.state().trackLen" | tr -d '"\\')
while true; do
  NOW=$(date +%s); ELAPSED=$((NOW-START))
  if [ $ELAPSED -gt 150 ]; then echo "TIMEOUT $TID remaining: ${(k)pend}"; break; fi
  RES=$(agent-browser eval "JSON.stringify({d:__race2.state().trackDist,ph:__race2.state().phase,lap:__race2.state().laps??0})" 2>/dev/null | tr -d '"\\')
  D=$(echo "$RES" | sed -n 's/.*d:\([0-9]*\).*/\1/p')
  if [ -n "$D" ]; then
    for t in ${(k)pend}; do
      DIFF=$((D-t)); ADIFF=${DIFF#-}
      if [ $ADIFF -le 12 ]; then
        unset "pend[$t]"
        sleep 0.2
        agent-browser screenshot "qa/v7-phase5/laps/${TAG}-d${t}.png" > /dev/null
        echo "SHOT $TID@$D -> ${TAG}-d${t}.png"
      fi
    done
  fi
  if [ ${#pend} -eq 0 ]; then echo "DONE $TID"; break; fi
  sleep 0.35
done
agent-browser eval "__race2.auto(false), 'stopped'" > /dev/null

#!/usr/bin/env bash
#
# Print the xcodebuild flag that opens this repo's iOS project — either
# `-workspace ios/App/App.xcworkspace` or `-project ios/App/App.xcodeproj`.
#
# Which one exists is Capacitor's choice, not ours, and it changed under us.
# Capacitor 8 emits a Swift Package Manager project when every plugin ships a
# Package.swift, which all seven of ours now do: no Podfile, no `pod install`,
# and so no .xcworkspace — CocoaPods is what generates that file. Capacitor 6
# produced the CocoaPods layout instead. ios/ is gitignored and regenerated on
# every build, so a tree that has not been rebuilt since the upgrade still holds
# a workspace while CI, starting from `npm ci`, gets the SPM project.
#
# Hardcoding either one is what broke CI: the workflow asked for a workspace,
# generation quietly produced a project, and the run failed two steps later with
# `'ios/App/App.xcworkspace' does not exist` — a message that points at the
# build rather than at the generation that actually changed. Detecting it here
# keeps both layouts building, and the echo to stderr puts the answer in the log
# so the next person does not have to infer it.
#
# Usage:  xcodebuild $(./scripts/xcode-target.sh) -scheme App …
# Unquoted on purpose: this prints two words that must become two arguments.
set -euo pipefail

WORKSPACE="ios/App/App.xcworkspace"
PROJECT="ios/App/App.xcodeproj"

if [ -d "$WORKSPACE" ]; then
  echo "xcode-target: CocoaPods layout, building $WORKSPACE" >&2
  printf -- '-workspace %s' "$WORKSPACE"
elif [ -d "$PROJECT" ]; then
  echo "xcode-target: Swift Package Manager layout, building $PROJECT" >&2
  printf -- '-project %s' "$PROJECT"
else
  echo "xcode-target: neither $WORKSPACE nor $PROJECT exists." >&2
  echo "The iOS project was not generated — run \`npx cap add ios\` first." >&2
  exit 1
fi

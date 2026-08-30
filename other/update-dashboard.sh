#!/bin/bash

REPO="https://github.com/aathehuman/ymc1.uk.git"
BRANCH="main"

LOCAL_DASHBOARD="/home/ymc/dashboard"
TEMP_DIR="/tmp/ymc-dashboard-update"

echo "========================================"
echo "   YMC Dashboard Updater"
echo "========================================"
echo ""

# Remove any previous temporary download
rm -rf "$TEMP_DIR"

echo "Downloading latest dashboard files..."
git clone --depth 1 --branch "$BRANCH" "$REPO" "$TEMP_DIR"

# Check whether cloning worked
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Could not download the latest files."
    echo "Check the internet connection."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

echo ""
echo "Updating prayer-data.js..."

cp "$TEMP_DIR/dashboard/prayer-data.js" \
   "$LOCAL_DASHBOARD/prayer-data.js"

echo "Updating assets folder..."

rsync -av --delete \
    "$TEMP_DIR/dashboard/assets/" \
    "$LOCAL_DASHBOARD/assets/"

# Check whether rsync worked
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Assets could not be updated."
    read -p "Press Enter to close..."
    exit 1
fi

# Clean up
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "   Dashboard successfully updated!"
echo "========================================"
echo ""
echo "You can now reload the dashboard."

read -p "Press Enter to close..."

#!/bin/bash
# Clark Bot — deploy content ideas feature
# Double-click this file to commit & push to Railway

cd "$(dirname "$0")"

echo "🔧 Cleaning stale git locks..."
rm -f .git/index.lock .git/HEAD.lock .git/ORIG_HEAD.lock .git/objects/maintenance.lock 2>/dev/null

echo "📦 Staging all changes..."
git add -A

echo "✏️  Committing..."
git commit -m "feat: content ideas — modal flow, Telegram direct send, Airtable sync, /pendientes PDF

- Discord: button → model selector → modal (Link + Notes fields)
- Telegram: send idea directly with ✅ Marcar como completada button
- Telegram: /pendientes command generates and sends PDF of pending ideas
- Airtable: sync idea creation and completion status
- DB: ideas table with status, completed_at, airtable_record_id, telegram_message_id
- pdfkit: clean A4 table PDF with alternating rows and date column"

echo "🚀 Pushing to origin/main (Railway will auto-deploy)..."
git push origin main

echo ""
echo "✅ Done! Railway is now deploying the new version."
echo "   Remember to add these env vars in Railway if not already set:"
echo "   AIRTABLE_API_KEY  = patmS2mfltM11oOom.0c7c36fb5965dceac5a93051844fc3a1358b1a933be76820f6decc89927ab349"
echo "   AIRTABLE_BASE_ID  = appjUIc1QeMPsW8L8"
echo "   AIRTABLE_TABLE_ID = tbli2cm40Bt9wBeGL"
echo ""
read -p "Press Enter to close..."

#!/bin/bash
# Clark Bot — force deploy
# Double-click this file in Finder to run

cd "$(dirname "$0")"

echo "🔧 Removing git lock files..."
rm -f .git/index.lock .git/HEAD.lock .git/ORIG_HEAD.lock .git/objects/maintenance.lock 2>/dev/null
echo "   Done."

echo ""
echo "📦 Staging all changes..."
git add src/commands/getnumber.js \
        src/handlers/getnumberHandler.js \
        src/commands/postmodelannouncement.js \
        src/handlers/announcementHandler.js \
        src/telegram/index.js \
        src/events/interactionCreate.js \
        src/commands/posttranslator.js \
        src/handlers/translatorHandler.js
git status --short

echo ""
echo "✏️  Committing..."
git commit -m "feat: AI translator /posttranslator — EN<>ES via Grok" 2>/dev/null || echo "   (nothing new to commit)"

echo ""
echo "🚀 Pushing to origin/main..."
git push origin main

echo ""
if [ $? -eq 0 ]; then
  echo "✅ Done! Railway will auto-deploy in ~2 minutes."
  echo ""
  echo "IMPORTANTE: añade la variable de entorno en Railway:"
  echo "  SMSPOOL_API_KEY = tu API key de SMSPool (32 caracteres)"
  echo ""
  echo "Registra el nuevo slash command ejecutando deploy-commands.js"
  echo "o reinicia el bot (Railway lo hace solo al hacer push)."
else
  echo "❌ Push failed. Check the error above."
fi

echo ""
read -p "Press Enter to close..."

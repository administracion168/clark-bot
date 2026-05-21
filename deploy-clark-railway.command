#!/bin/bash
# ============================================
# CLARK BOT - Deploy a Railway
# ============================================

cd "/Users/samuel/Desktop/CLARK BOT"

echo ""
echo "============================================"
echo "  CLARK BOT - Deploy a Railway"
echo "============================================"
echo ""

# 1. Instalar Railway CLI si no está instalado
if ! command -v railway &> /dev/null; then
    echo "📦 Instalando Railway CLI..."
    npm install -g @railway/cli
    echo "✅ Railway CLI instalado"
else
    echo "✅ Railway CLI ya instalado"
fi

echo ""
echo "🔐 Iniciando sesión en Railway..."
echo "   (Se abrirá el navegador para que inicies sesión)"
echo ""
railway login

echo ""
echo "🚀 Creando proyecto en Railway..."
railway init --name "clark-bot"

echo ""
echo "⚙️  Configurando variables de entorno..."
railway variables set \
  DISCORD_TOKEN="MTQ5MzI0MjYyNTgwMzk0NDEwNg.Gmjv8J.W-B0XjDGk4Qgs_A9iKm9TqqmXd3jZd3awv_S4Q" \
  CLIENT_ID="1493242625803944106" \
  GUILD_ID="1432078896521810173" \
  LOG_CHANNEL_ID="1493244193886179378" \
  REPORT_CHANNEL_ID="1493244454398722224"

echo "✅ Variables configuradas"

echo ""
echo "📤 Subiendo el bot a Railway..."
railway up --detach

echo ""
echo "============================================"
echo "✅ ¡CLARK BOT desplegado en Railway!"
echo ""
echo "Para ver el dashboard: railway open"
echo "Para ver los logs:     railway logs"
echo "============================================"
echo ""
echo "⚠️  IMPORTANTE: Ve al dashboard de Railway"
echo "   y añade un volumen en /app/data para"
echo "   guardar la base de datos SQLite."
echo ""
read -p "Presiona ENTER para abrir el dashboard..."
railway open

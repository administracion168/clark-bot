#!/bin/bash
# ============================================
# CLARK BOT - Deploy final a Railway
# ============================================

cd "/Users/samuel/Desktop/CLARK BOT"

echo ""
echo "============================================"
echo "  CLARK BOT - Deploy a Railway"
echo "============================================"
echo ""

# Autenticar con token (sin necesidad de navegador)
export RAILWAY_TOKEN="5f02c472-4733-4228-83a8-07dbbc82f794"

echo "✅ Token de Railway configurado"
echo ""

# Crear nuevo proyecto en Railway
echo "🚀 Creando proyecto clark-bot en Railway..."
railway init --name "clark-bot"

echo ""
echo "⚙️  Configurando variables de entorno..."
railway variables set \
  DISCORD_TOKEN="MTQ5MzI0MjYyNTgwMzk0NDEwNg.Gmjv8J.W-B0XjDGk4Qgs_A9iKm9TqqmXd3jZd3awv_S4Q" \
  CLIENT_ID="1493242625803944106" \
  GUILD_ID="1432078896521810173" \
  LOG_CHANNEL_ID="1493244193886179378" \
  REPORT_CHANNEL_ID="1493244454398722224" \
  NODE_ENV="production"

echo "✅ Variables configuradas"
echo ""

echo "📤 Desplegando el bot..."
railway up --detach

echo ""
echo "============================================"
echo "✅ ¡CLARK BOT desplegado en Railway!"
echo ""
echo "Para ver los logs en tiempo real:"
echo "  railway logs --tail"
echo ""
echo "⚠️  RECUERDA: Ve al dashboard de Railway"
echo "   Volumes -> Añadir volumen en /app/data"
echo "   para persistir la base de datos SQLite"
echo "============================================"
echo ""
read -p "Presiona ENTER para abrir el dashboard de Railway..."
open "https://railway.com/dashboard"

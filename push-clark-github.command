#!/bin/bash
# Push CLARK BOT to GitHub (con token, sin pedir contraseña)
cd "/Users/samuel/Desktop/CLARK BOT"

echo ""
echo "============================================"
echo "  Subiendo CLARK BOT a GitHub..."
echo "============================================"
echo ""

# Configurar remote con token incluido
git remote remove origin 2>/dev/null
git remote add origin https://administracion168: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@github.com/administracion168/clark-bot.git

echo "📤 Haciendo push a GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "============================================"
echo "✅ ¡Código subido a GitHub exitosamente!"
echo "============================================"
echo ""
read -p "Presiona ENTER para cerrar..."

#!/bin/bash
# Script para inicializar git en CLARK BOT
cd "/Users/samuel/Desktop/CLARK BOT"

# Limpiar si hay git corrupto previo
rm -rf .git

# Inicializar git
git init
git branch -m main
git config user.email "clark@laislaagency.com"
git config user.name "La Isla Agency"

# Añadir archivos (excluye .env y node_modules por el .gitignore)
git add .
git status --short

# Commit inicial
git commit -m "Initial commit: CLARK Discord bot"

echo ""
echo "✅ Git inicializado correctamente"
echo "Ahora vuelve al chat para continuar con GitHub y Railway"
echo ""
read -p "Presiona ENTER para cerrar..."

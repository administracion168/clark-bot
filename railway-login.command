#!/bin/bash
# Login en Railway
echo ""
echo "🔐 Abriendo Railway para iniciar sesión..."
echo "   Tienes 5 minutos para completar el login en el navegador."
echo ""
railway login --browserless
echo ""
echo "✅ Si ves 'Logged in as ...' arriba, ¡el login fue exitoso!"
echo ""
read -p "Presiona ENTER para cerrar..."

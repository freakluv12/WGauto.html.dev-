#!/bin/bash

# Скрипт для запуска миграций на Render.com
# Использование: ./run-migrations.sh "your_database_url"

if [ -z "$1" ]; then
    echo "❌ Ошибка: укажите DATABASE_URL"
    echo "Использование: ./run-migrations.sh 'postgresql://user:pass@host/db'"
    exit 1
fi

DATABASE_URL=$1

echo "🔄 Запуск миграций..."
echo "📦 База данных: ${DATABASE_URL%%@*}@***"

# Проверка подключения
psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Не удалось подключиться к базе данных"
    echo "Проверьте DATABASE_URL"
    exit 1
fi

echo "✅ Подключение установлено"

# Запуск миграций
psql "$DATABASE_URL" -f migrations.sql

if [ $? -eq 0 ]; then
    echo "✅ Миграции успешно выполнены!"
    echo ""
    echo "🔐 Проверьте логи сервера для получения admin пароля"
    echo "📧 Email: admin@wgauto.com"
else
    echo "❌ Ошибка при выполнении миграций"
    exit 1
fi

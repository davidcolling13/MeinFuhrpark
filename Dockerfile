FROM node:20-alpine

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Abhängigkeiten installieren
COPY package.json package-lock.json* ./
RUN npm install

# Quellcode kopieren
COPY . .

# Frontend bauen (Vite)
RUN npm run build

# Datenverzeichnis für SQLite sicherstellen
RUN mkdir -p data

# Port freigeben
EXPOSE 3000

# Server starten
CMD ["npm", "start"]
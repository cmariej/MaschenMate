# MaschenMate

MaschenMate ist ein Angular-Frontend mit Express-/TypeScript-API. Nutzer können Häkel- und Strickprojekte mit Bild, Maschenprobe, abschnittsweiser Anleitung, Wiederholungen, Garnen und Nadeln anlegen und ihren Reihenfortschritt verfolgen. Registrierung und Anmeldung funktionieren mit Name, eindeutigem Benutzernamen und Passwort; bei der Registrierung kann ein Profilbild hinzugefügt werden. Über das Avatar-Menü können Benutzer nach Benutzernamen gesucht, Freundschaftsanfragen gesendet, angenommen oder abgelehnt und Freunde entfernt werden. Die API stellt Sitzungen als signierte JWTs in `HttpOnly`-Cookies bereit.

Die öffentliche Route `/datenschutz-impressum` enthält die Datenschutz- und Betreiberinformationen. Vor einer Veröffentlichung müssen insbesondere tatsächlicher Hosting-Anbieter, Serverstandort, eingesetzte Auftragsverarbeiter und Speicherfristen der Serverprotokolle anhand der Deployment-Konfiguration verifiziert und ergänzt werden. Der Text ist keine Rechtsberatung.

Benutzernamen sind nicht case-sensitiv und müssen 5–20 Zeichen aus Buchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten. Neue Passwörter müssen mindestens 8 Zeichen sowie Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen enthalten. Profil- und Projektbilder akzeptieren JPG, PNG oder WebP bis 5 MB; ohne Profilbild wird ein Platzhalter angezeigt. Passwörter werden ausschließlich als bcrypt-Hash gespeichert.

Neue Registrierungen bleiben bis zur Freigabe durch den Admin `clara` gesperrt. Eine Registrierung mit dem Benutzernamen `clara` wird als Admin-Konto automatisch freigeschaltet. Clara kann alle anderen offenen Anfragen im Avatar-Menü unter „Registrierungsanfragen“ annehmen oder ablehnen. Bestehende Konten ohne gespeichertes Freigabefeld werden bei der Migration zur Prüfung vorgemerkt; das Konto `clara` bleibt dabei als Admin zugänglich.

## Projekte und Fortschritt

- Das Dashboard zeigt den Fortschritt des zuletzt bearbeiteten laufenden Projekts mit Abschnittsauswahl und Plus-/Minus-Zähler für Reihen sowie die drei zuletzt bearbeiteten Projekte. Die untere Navigation trennt Dashboard, Projektliste, Garne und Nadeln. Die vollständige Projektliste lässt sich nach Projektart (Stricken oder Häkeln) und Kategorie (z. B. Pullover oder Schal) filtern.
- Der Dashboard-Feed zeigt Projektstarts, abgeschlossene Abschnitte, fertiggestellte und abgebrochene Projekte des eigenen Kontos und der bestätigten Freunde. Fertigstellungen werden besonders hervorgehoben; ein laufendes Projekt kann in den Projektdetails abgebrochen werden.
- Im Projekt werden zuerst die verwendeten Garne ausgewählt und anschließend Maschen und Reihen je 10 × 10-cm-Probe für jedes Garn angegeben. Die Maschenprobe gehört zum Projekt und nicht zum Garnstammdatensatz.
- Anleitungen sind in benannte Abschnitte mit Reihenbereichen oder Einzelreihen, Anweisungen und Maschenzahl je Reihe gegliedert. Ein Reihenwechsel kann als wiederholter Zyklus (z. B. rechte/linke Maschen) abgebildet werden. Jeder Abschnitt kann eine Nadel erhalten; für jede einzelne Reihe bzw. jeden Eintrag lässt sich das Garn auswählen. Standardmäßig ist das erste für das Projekt gewählte Garn vorausgewählt; ein separates Hauptgarn gibt es nicht.
- Eine Anweisung besteht aus Einzelreihe oder Reihenbereich, Text, Maschenzahl pro Reihe und Garn. Daneben bleibt der eigene Typ für wechselnde Reihenfolgen wie rechte/linke Maschen erhalten.
- Projekte besitzen Vorschau-, Detail- und Bearbeitungsansichten. Garne und Nadeln zeigen alle Stammdaten direkt in der Vorschau; ein Klick öffnet unmittelbar die Bearbeitung. Bearbeitungsansichten werden über eigene Routen geöffnet, nicht als Modals. Im Projekt kann es gestartet, ein aktueller Abschnitt ausgewählt und der Reihenstand vor- oder zurückgezählt werden. Start und Reihenänderungen werden im Verlauf protokolliert; Abschnitts- und Gesamtfortschritt gewichten abgeschlossene Reihen nach ihrer Maschenzahl.
- Garne und Nadeln lassen sich unabhängig von Projekten in den separaten Material-Tabs pflegen und pro Projekt mehrfach auswählen. Die Garnliste kann nach Nadelstärke, Farbe und Material gefiltert werden; Mehrfachauswahl ist pro Filter möglich. Garnstammdaten enthalten Name, Marke, Farbe, Farbnummer (die Kennung auf der Garnbanderole), Nadelgröße, Lauflänge und Gewicht sowie eine mehrteilige Materialzusammensetzung mit Prozentanteilen (bei Angabe zusammen 100 %). Neben gängigen Fasern können eigene Materialien ergänzt werden. Der Garnbedarf wird ohne zusätzliche Garnfelder geschätzt: Die summierten Maschen je Garn werden anhand der Maschenprobe in Meter umgerechnet und durch die Lauflänge pro Knäuel geteilt. Verbrauch und verbleibender Bedarf richten sich nach den als erledigt markierten Reihen; Knäuel werden auf ganze Einheiten aufgerundet.
- Lokal liegen Konten in `backend/data/users.json`, Freundschaften in `backend/data/friendships.json`, Aktivitäten in `backend/data/activities.json`, Projekte in `backend/data/projects.json` und die Materialverwaltung in `backend/data/materials.json`. Die Dateien werden automatisch angelegt und über Backend-Neustarts hinweg weiterverwendet. Auf dem Homeserver speichert MongoDB Konten, Freundschaften, Aktivitäten, Projekte und Materialien im persistenten Docker-Volume.

## Voraussetzungen

- Node.js 22.22.3 oder 24.15.0 (oder neuer innerhalb einer unterstützten Angular-Version) und npm

## Lokal starten

1. Abhängigkeiten installieren:

   ```sh
   npm install
   ```

2. Frontend und Backend gemeinsam starten. Das funktioniert im Projektstamm oder im `backend`-Ordner:

   ```sh
   npm run dev
   ```

   API und Angular-Entwicklungsserver laufen parallel im selben Terminal. Mit `Ctrl+C` werden beide beendet. Konto- und Projektdaten bleiben in den JSON-Dateien unter `backend/data/` erhalten und werden beim nächsten Start wieder geladen. Für die lokale Entwicklung ist keine `.env`-Datei erforderlich.

   Frontend: <http://localhost:4200>  
   API-Status: <http://localhost:3000/api/health>

## Nützliche Befehle

```sh
npm run build
npm run build --workspace=backend
npm run build --workspace=frontend
```

## Deployment: GitHub Pages und Homeserver

Für Anmeldung mit sicheren Cookies müssen Frontend und API unter derselben eigenen Domain liegen, zum Beispiel `app.example.com` und `api.example.com`. Eine GitHub-Pages-Adresse unter `github.io` und eine unabhängige Homeserver-Domain gelten im Browser als verschiedene Websites; dabei können Browser die erforderlichen Anmelde-Cookies blockieren. Richte deshalb eine eigene Domain für GitHub Pages und eine API-Subdomain ein.

### GitHub Pages

1. Weise in den Repository-Einstellungen unter **Pages** die eigene Frontend-Domain zu und hinterlege die dafür nötigen DNS-Einträge.
2. Lege unter **Settings → Secrets and variables → Actions → Variables** die Repository-Variable `API_URL` mit dem API-Ursprung an, zum Beispiel `https://api.example.com` (ohne `/api`).
3. Aktiviere als Pages-Buildquelle **GitHub Actions**. Der Workflow `.github/workflows/pages.yml` baut und veröffentlicht das Angular-Frontend nach jedem Push auf `main`.

### Homeserver

1. Lege auf dem Homeserver `backend/.env.production` aus der Vorlage `backend/deploy.env.example` an. Setze `FRONTEND_URL` auf den exakten Frontend-Ursprung, zum Beispiel `https://app.example.com`, und ersetze `JWT_SECRET`, `COOKIE_SECRET` sowie `MONGO_ROOT_PASSWORD` durch zufällige Geheimnisse. Du kannst einen Wert lokal mit `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` erzeugen. Das Hex-Format ist auch für das Datenbankpasswort geeignet.
2. Richte im DNS `api.example.com` auf deinen Homeserver und im Router HTTPS/443 auf deinen Reverse Proxy weiter. Konfiguriere dort ein gültiges HTTPS-Zertifikat und leite `api.example.com` intern an `http://127.0.0.1:3000` weiter. MongoDB wird nicht nach außen veröffentlicht.
3. Klone das Repository auf den Homeserver und starte dort im Projektordner:

   ```sh
   docker compose --env-file backend/.env.production up -d --build
   ```

   Das startet Backend und MongoDB. MongoDB speichert Konten, Projekte und Materiallisten im Volume `maschenmate-mongodb`, das Container-Neustarts und ein erneutes `docker compose up` überlebt. `docker compose down` erhält das Volume; **`docker compose down -v` löscht alle gespeicherten Daten**.

Für ein Backup regelmäßig einen MongoDB-Dump anfertigen und außerhalb des Homeservers sichern. Die JSON-Datei der lokalen Entwicklung wird nicht automatisch in die Online-MongoDB importiert.

## Produktionshinweise

- `backend/.env` und Dateien unter `backend/data/` niemals einchecken. Sie enthalten Kontodaten, Passwort-Hashes, Projektbilder und Materiallisten.
- `backend/.env.production` niemals einchecken; sie enthält die Sitzungsschlüssel.
- In der lokalen Entwicklung werden Cookie- und Sitzungsschlüssel automatisch erzeugt; nach einem Backend-Neustart musst du dich erneut anmelden. In Produktion `JWT_SECRET` und `COOKIE_SECRET` in der Umgebung setzen, jeweils mit mindestens 32 Zeichen.
- Die lokale JSON-Datei ist für Entwicklung und kleine Einzelplatz-Anwendungen gedacht. Für mehrere gleichzeitige Backend-Instanzen oder produktive Mehrbenutzersysteme ist eine Serverdatenbank geeigneter.
- Für den einfachen Cookie-Betrieb Frontend und API hinter derselben HTTPS-Domain bzw. einem Reverse-Proxy mit `/api`-Weiterleitung veröffentlichen. In Produktion setzt die API `Secure`-Cookies; `FRONTEND_URL` muss auf die tatsächliche HTTPS-Adresse angepasst werden.

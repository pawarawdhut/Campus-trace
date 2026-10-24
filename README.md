
# CampusTrace

CampusTrace is an individual Express.js web application for reporting lost and found items on campus. The React and Vite frontend uses an Express server with modular API routing, server-side validation, and JSON file storage.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run in development

Open two terminals in the project directory:

```sh
npm run server
npm run dev
```

Open the Vite URL shown in the second terminal. Vite forwards `/api` requests to the Node.js server at `http://localhost:3000`.

## Run as a Node.js web application

```sh
npm install
npm run build
npm start
```

Open `http://localhost:3000`. The Express server serves the built frontend and handles API requests. Set the `PORT` environment variable to use a different port.

## Deploy to Render

This repository includes a Render Blueprint in `render.yaml`. To deploy:
The Blueprint uses Render's free web-service plan for a presentation/demo. Its filesystem is ephemeral, so reports and claims submitted by users can be lost when the service restarts or redeploys. The included JSON files are suitable for a demo, not durable production storage. Use a persistent disk or migrate the app to a managed database before relying on stored records.

## Routes and validation

- `GET /api/items` returns saved item reports.
- `POST /api/items` validates and saves a lost/found item report.
- `DELETE /api/items/:id` removes an item report.
- `POST /api/reset` restores the seeded item reports.
- `POST /api/claims` validates and saves an ownership claim.

Reports require a valid Lost/Found type, an approved category and campus location, a 3-80 character title, a 10-digit Indian mobile number, and a 10-500 character description. Claims require a 5-20 character alphanumeric PRN/roll number and 10-500 characters of ownership proof. Invalid submissions return HTTP 400 with field-specific errors; successful submissions return a success message.

Item reports and claims are stored in JSON files in `server/data` by default. Set `DATA_DIR` to choose a different writable data directory. The server initializes the item file from `server/data/default-items.json` on first run. Runtime data files are ignored by Git.

## Test

```sh
npm test
npm run lint
npm run build
```

The HTTP tests exercise GET, valid and invalid POST inputs, DELETE, reset, malformed requests, and request-size limits against the Express server.

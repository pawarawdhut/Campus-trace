
# CampusTrace

CampusTrace is an individual Express.js web application for reporting lost and found items on campus. The React and Vite frontend uses an Express server, server-side validation, and a SQLite database for item records. Ownership claims remain in a JSON file.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run in development

Run in one terminal in the project directory:

```sh
npm run dev
```

`npm run dev` starts both the Vite frontend and Express API. Open the Vite URL shown in the terminal; frontend API calls are proxied to the backend automatically. The local demo admin password defaults to `123456789`. To use a different password, set `$env:ADMIN_PASSWORD = "your-private-password"` before starting the app.

## Run as a Node.js web application

```sh
npm install
npm run build
npm start
```

Open `http://localhost:3000`. The Express server serves the built frontend and handles API requests. Set the `PORT` environment variable to use a different port.
Set a strong `ADMIN_PASSWORD` in the server environment to enable the protected admin page at `http://localhost:3000/admin`. Production does not use the local demo default.

## Deploy to Render

This repository includes a Render Blueprint in `render.yaml`. To deploy:

1. Push the project to GitHub.
2. Sign in to Render and choose **New + → Blueprint**.
3. Connect the GitHub repository containing this project and confirm the `campus-trace` web service. Set a strong `ADMIN_PASSWORD` when prompted by the Blueprint.
4. Wait for the build and deploy to finish. Open the `onrender.com` URL shown by Render.
5. Check that the app loads and that `<your-render-url>/api/items` returns the seeded items.

The current deployment is available at [https://campus-trace-39hn.onrender.com](https://campus-trace-39hn.onrender.com). The free service uses an ephemeral filesystem, so SQLite records may be lost when the service restarts or redeploys.

The Blueprint uses Render's free web-service plan for a presentation/demo. Its filesystem is ephemeral, so reports and claims submitted by users can be lost when the service restarts or redeploys. The included JSON files are suitable for a demo, not durable production storage. Use a persistent disk or migrate the app to a managed database before relying on stored records.

## Routes and validation

- `GET /api/items` returns saved item reports.
- `GET /api/items/:id` returns one report by numeric ID.
- `POST /api/items` validates and creates a lost/found item report.
- `PUT /api/items/:id` validates and replaces a report.
- `PATCH /api/items/:id` validates and partially updates a report.
- `DELETE /api/items/:id` removes a report.
- `POST /api/reset` restores the seeded item reports.
- `POST /api/claims` validates and saves an ownership claim.
- `GET /admin` provides a password-protected admin page. Admins can review all item reports and claims, view submitted PRNs and ownership proof, then mark claims Pending, Approved, or Rejected.

Reports require a valid Lost/Found type, an approved category and campus location, a 3-80 character title, a 10-digit Indian mobile number, and a 10-500 character description. Claims can be submitted for Found items only and include the selected item, a 5-20 character alphanumeric PRN/roll number, and 10-500 characters of ownership proof. Invalid submissions return HTTP 400 with field-specific errors; successful submissions return a success message.

Item reports are stored in `campus-trace.sqlite` in `server/data` by default. Set `DATA_DIR` to choose a different writable data directory. On first startup the server imports an existing `items.json` file when present, otherwise it seeds the SQLite database from `server/data/default-items.json`. Ownership claims remain in `claims.json`. Runtime database, WAL, and claims files are ignored by Git.

## Postman

Import `postman/CampusTrace.postman_collection.json` into Postman. Start the local server with `npm run dev` or `npm start`, select **CampusTrace CRUD API**, and run the collection. The collection creates a record and saves its ID for the read, PUT, PATCH, DELETE, and post-delete checks. To test a deployment, change the collection variable `baseUrl` to `https://<your-render-service>.onrender.com/api` before running it. The test scripts assert the expected HTTP status codes and response fields.

For Render, follow the deployment steps above. The included free web-service configuration has an ephemeral filesystem: SQLite data may be lost when the service restarts or redeploys. Set `DATA_DIR` to a mounted persistent disk or move to a managed database for durable hosted records. Deployment must be completed from a Render account connected to the GitHub repository; the public service URL is assigned by Render.

The admin page is available at `/admin`. Locally, the demo password is `123456789` unless overridden with `ADMIN_PASSWORD`. In production, a strong, private `ADMIN_PASSWORD` environment variable is required. The page shows item reports stored in `server/data/items.json` as well as submitted claims. Admin sessions use an HTTP-only cookie and expire after eight hours; signing out ends the session. Configure `ADMIN_PASSWORD` in the hosting provider's environment settings for deployment. Keep this password and claim data private.

The Render Blueprint installs development dependencies during its build because Vite is needed to compile the frontend; the production start command runs only the Express server.

## Test

```sh
npm test
npm run lint
npm run build
```

The HTTP tests exercise CRUD operations, validation, claims, admin review, reset, malformed requests, and request-size limits against the Express server. `npm test`, `npm run lint`, and `npm run build` are the local verification commands.

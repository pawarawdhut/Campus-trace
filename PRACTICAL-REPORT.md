# Practical Report: CampusTrace REST API

## Aim

Develop and test a RESTful API that creates, retrieves, updates, and deletes campus lost-and-found records stored in a database.

## Tools and technologies

- Node.js and Express.js
- SQLite with `better-sqlite3`
- React and Vite frontend
- Postman collection: `postman/CampusTrace.postman_collection.json`
- Render deployment configuration: `render.yaml`

## Implementation

Item records are stored in the SQLite database `campus-trace.sqlite` under `DATA_DIR` (default: `server/data`). On first startup, the application migrates an existing `items.json` file when present; otherwise it loads the sample records from `server/data/default-items.json`. API input is validated before records are created or updated. Ownership claims and the existing protected admin workflow are preserved.

## API endpoints

| Method | Endpoint | Purpose | Expected success |
| --- | --- | --- | --- |
| GET | `/api/items` | List records | 200 OK |
| GET | `/api/items/:id` | Retrieve one record | 200 OK |
| POST | `/api/items` | Create a record | 201 Created |
| PUT | `/api/items/:id` | Replace a record | 200 OK |
| PATCH | `/api/items/:id` | Partially update a record | 200 OK |
| DELETE | `/api/items/:id` | Delete a record | 200 OK |

Invalid record IDs return 400, nonexistent records return 404, and invalid record fields return 400 with field-specific errors.

## Test procedure

1. Start the app with `npm run dev` or build and start it with `npm run build` and `npm start`.
2. Import the Postman collection.
3. Set `baseUrl` to `http://localhost:3000/api` for local testing, or to `https://<your-render-service>.onrender.com/api` after deployment.
4. Run the collection in order. It creates a record, lists records, reads the created record, replaces it with PUT, changes its title with PATCH, deletes it, and verifies the deleted record returns 404.
5. Capture screenshots in Postman showing the collection test results and successful responses. Save them with the Moodle submission.

## Verification and submission status

- Automated HTTP tests: `npm test` — passed (9 tests).
- Static checks: `npm run lint` — passed.
- Production build: `npm run build` — passed.
- Postman collection JSON validation — passed.
- Postman/Newman collection run against local API — passed (7 requests, 7 assertions).
- Postman request collection: provided at `postman/CampusTrace.postman_collection.json`; run it in Postman and capture screenshots before submission.
- Render deployment URL: **pending deployment in the student's Render account**.
- Postman desktop/web screenshots: **not captured; capture after running the collection in the Postman UI**. The executed Newman CLI run is a Postman collection run but is not represented as a Postman UI screenshot.

## Deployment notes

The repository includes a Render Blueprint. Push the source to GitHub, create a Blueprint service in Render, configure a private `ADMIN_PASSWORD`, deploy, and use the URL Render assigns. Update the collection's `baseUrl` to the deployed `/api` URL and rerun it. The current free Render service has ephemeral storage; use a persistent disk or managed database if submitted records must survive restarts and redeploys.

## Conclusion

The API supports validated create, list, single-record read, full update, partial update, and delete operations using SQLite. Local automated verification and the supplied Postman collection cover the CRUD flow. A public deployment URL and screenshots remain to be added after deployment and Postman execution through the student's accounts.

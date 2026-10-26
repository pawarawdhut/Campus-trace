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
- Postman/Newman collection run against the deployed API — passed (7 requests, 7 assertions, 0 failures).
- Render deployment URL: [https://campus-trace-39hn.onrender.com](https://campus-trace-39hn.onrender.com)
- Hosted API test summary: `postman/results/render-test-summary.html`.
- Hosted test summary screenshot: `postman/results/render-test-summary.png`. This documents the successful Newman CLI run, not the Postman desktop/web UI.
- Postman desktop/web UI screenshots: **not captured**. The attached summary represents the Newman run and is not a screenshot of the Postman UI.
- Moodle upload: **not completed; the Moodle course/assignment destination was not provided**. Upload the source, report, and test evidence to the correct Moodle activity.

## Deployment notes

The source was pushed to GitHub and deployed as a free Render web service. The service uses an ephemeral filesystem, so SQLite records may be lost on restart or redeploy. Use persistent storage or a managed database if hosted records must survive restarts.

## Conclusion

The API supports validated create, list, single-record read, full update, partial update, and delete operations using SQLite. Automated tests and the supplied Postman collection passed locally and against the public deployment. Capture Postman UI screenshots if the Moodle assignment requires screenshots of the desktop/web app instead of Newman CLI evidence, then upload the materials through Moodle.

import { useEffect, useState } from 'react';

const statuses = ['Pending', 'Approved', 'Rejected'];

async function readResponse(response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
  return result;
}

export default function Admin() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [claims, setClaims] = useState([]);
  const [items, setItems] = useState([]);
  const [draftStatuses, setDraftStatuses] = useState({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAdminData = async () => {
    setIsLoadingData(true);
    setError('');
    try {
      const [claimsResult, itemsResult] = await Promise.all([
        fetch('/api/admin/claims').then(readResponse),
        fetch('/api/admin/items').then(readResponse),
      ]);
      setClaims(claimsResult.claims);
      setDraftStatuses(Object.fromEntries(claimsResult.claims.map((claim) => [claim.id, claim.status])));
      setItems(itemsResult.items);
      setIsAuthenticated(true);
    } catch (requestError) {
      if (requestError.message === 'Admin login required.') {
        setIsAuthenticated(false);
      } else {
        setError(requestError.message);
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetch('/api/admin/session')
      .then(readResponse)
      .then(() => loadAdminData())
      .catch((requestError) => {
        if (requestError.message !== 'Admin login required.') setError(requestError.message);
      })
      .finally(() => setIsCheckingSession(false));
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await readResponse(await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }));
      setPassword('');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleStatusSave = async (claimId) => {
    setError('');
    setMessage('');
    try {
      const result = await readResponse(await fetch(`/api/admin/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: draftStatuses[claimId] }),
      }));
      setClaims((currentClaims) => currentClaims.map((claim) => (
        claim.id === claimId ? result.claim : claim
      )));
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleLogout = async () => {
    setError('');
    try {
      await readResponse(await fetch('/api/admin/logout', { method: 'POST' }));
      setIsAuthenticated(false);
      setClaims([]);
      setItems([]);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (isCheckingSession) {
    return <main className="container py-5 text-center" role="status">Checking admin session...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="container py-5" style={{ maxWidth: '480px' }}>
        <a href="/" className="text-decoration-none">&larr; Back to CampusTrace</a>
        <div className="card shadow-sm mt-4">
          <div className="card-body p-4">
            <h1 className="h3 mb-2">Admin sign in</h1>
            <p className="text-muted">Sign in to review and manage campus item claims.</p>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <form onSubmit={handleLogin}>
              <label htmlFor="admin-password" className="form-label">Admin password</label>
              <input
                id="admin-password"
                className="form-control mb-3"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button className="btn btn-primary w-100" type="submit">Sign in</button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const pendingCount = claims.filter((claim) => (claim.status ?? 'Pending') === 'Pending').length;

  return (
    <main className="container py-4 py-md-5">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <a href="/" className="text-decoration-none">&larr; CampusTrace</a>
          <h1 className="h2 mt-2 mb-1">Admin dashboard</h1>
          <p className="text-muted mb-0">
            {items.length} item reports · {claims.length} claims · {pendingCount} claims pending
          </p>
        </div>
        <button className="btn btn-outline-secondary" type="button" onClick={handleLogout}>Sign out</button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {isLoadingData ? (
        <div className="text-center py-5" role="status">Loading admin data...</div>
      ) : (
        <>
          <section className="mb-5" aria-labelledby="item-reports-title">
            <h2 id="item-reports-title" className="h4 mb-3">Item reports</h2>
            {items.length === 0 ? (
              <div className="card">
                <div className="card-body text-center py-4 text-muted">No item reports have been submitted.</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-striped table-bordered align-middle bg-white">
                  <thead className="table-dark">
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Item</th>
                      <th scope="col">Category</th>
                      <th scope="col">Location</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="text-nowrap">{item.date}</td>
                        <td>{item.type}</td>
                        <td>{item.title}</td>
                        <td>{item.category}</td>
                        <td>{item.location}</td>
                        <td className="text-nowrap">{item.contact}</td>
                        <td style={{ minWidth: '220px', whiteSpace: 'pre-wrap' }}>{item.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="claim-requests-title">
            <h2 id="claim-requests-title" className="h4 mb-3">Claim requests</h2>
            {claims.length === 0 ? (
              <div className="card">
                <div className="card-body text-center py-4 text-muted">No claim requests have been submitted.</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-striped table-bordered align-middle bg-white">
                  <thead className="table-dark">
                    <tr>
                      <th scope="col">Submitted</th>
                      <th scope="col">Found item</th>
                      <th scope="col">PRN / Roll No.</th>
                      <th scope="col">Ownership proof</th>
                      <th scope="col">Status</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => (
                      <tr key={claim.id}>
                        <td className="text-nowrap">{new Date(claim.submittedAt).toLocaleString()}</td>
                        <td>{claim.itemTitle}</td>
                        <td>{claim.prn}</td>
                        <td style={{ minWidth: '240px', whiteSpace: 'pre-wrap' }}>{claim.proof}</td>
                        <td>
                          <select
                            aria-label={`Status for ${claim.itemTitle}`}
                            className="form-select"
                            value={draftStatuses[claim.id] ?? 'Pending'}
                            onChange={(event) => setDraftStatuses((current) => ({
                              ...current,
                              [claim.id]: event.target.value,
                            }))}
                          >
                            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary text-nowrap"
                            type="button"
                            onClick={() => handleStatusSave(claim.id)}
                          >
                            Save status
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

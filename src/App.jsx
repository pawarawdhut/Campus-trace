import { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';

const categories = ['Electronics', 'Stationery', 'Identity/Cards', 'Keys', 'Other'];
const locations = [
  'Central Library',
  'Student Cafeteria',
  'Sports Complex',
  'Main Academic Building',
  'Hostel Block A/B',
];

function validateItemForm(formData) {
  const errors = {};
  const item = Object.fromEntries(
    Object.entries(formData).map(([field, value]) => [field, typeof value === 'string' ? value.trim() : '']),
  );

  if (!['Lost', 'Found'].includes(item.type)) errors.type = 'Select Lost or Found.';
  if (item.title.length < 3 || item.title.length > 80) errors.title = 'Title must be between 3 and 80 characters.';
  if (!categories.includes(item.category)) errors.category = 'Select a valid item category.';
  if (!locations.includes(item.location)) errors.location = 'Select a valid campus location.';
  if (!/^[6-9]\d{9}$/.test(item.contact)) errors.contact = 'Enter a valid 10-digit mobile number.';
  if (item.desc.length < 10 || item.desc.length > 500) errors.desc = 'Description must be between 10 and 500 characters.';

  return errors;
}

function validateClaimForm(claimData, claimItem) {
  const errors = {};
  const prn = claimData.prn.trim();
  const proof = claimData.proof.trim();

  if (!claimItem || claimItem.type !== 'Found') errors.itemId = 'Select an available found item to claim.';
  if (!/^[a-zA-Z0-9-]{5,20}$/.test(prn)) {
    errors.prn = 'Enter a PRN or roll number between 5 and 20 letters, numbers, or hyphens.';
  }
  if (proof.length < 10 || proof.length > 500) {
    errors.proof = 'Ownership proof must be between 10 and 500 characters.';
  }

  return errors;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [alertInfo, setAlertInfo] = useState({ type: '', message: '' });

  const [formData, setFormData] = useState({
    type: '',
    title: '',
    category: '',
    location: '',
    contact: '',
    desc: ''
  });

  const [errors, setErrors] = useState({});
  const [claimData, setClaimData] = useState({ prn: '', proof: '' });
  const [claimErrors, setClaimErrors] = useState({});
  const [claimItem, setClaimItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showAlert = (type, message) => {
    setAlertInfo({ type, message });
    setTimeout(() => setAlertInfo({ type: '', message: '' }), 4000);
  };

  useEffect(() => {
    let isMounted = true;
    let isInitialLoad = true;
    let lastRefreshError = '';
    const refreshItems = async () => {
      try {
        const response = await fetch('/api/items', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to load campus records.');
        if (isMounted) {
          setItems(result.items);
          lastRefreshError = '';
        }
      } catch (error) {
        if (isMounted && error.message !== lastRefreshError) {
          showAlert('danger', error.message);
          lastRefreshError = error.message;
        }
      } finally {
        if (isMounted && isInitialLoad) setIsLoading(false);
        isInitialLoad = false;
      }
    };

    refreshItems();
    const refreshInterval = window.setInterval(refreshItems, 5000);
    return () => {
      isMounted = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateItemForm(formData);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors || {});
        throw new Error(result.message || 'Unable to submit this report.');
      }
      setItems((currentItems) => [result.item, ...currentItems]);
      setFormData({ type: '', title: '', category: '', location: '', contact: '', desc: '' });
      showAlert('success', result.message);
      window.bootstrap.Modal.getInstance(document.getElementById('reportModal'))?.hide();
    } catch (error) {
      showAlert('danger', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to remove this record.');
      setItems((currentItems) => currentItems.filter((item) => item.id !== id));
      showAlert('success', result.message);
    } catch (error) {
      showAlert('danger', error.message);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Reset all items back to default list?')) {
      try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to reset campus records.');
        setItems(result.items);
        showAlert('success', result.message);
      } catch (error) {
        showAlert('danger', error.message);
      }
    }
  };

  const handleFoundItemReport = (item) => {
    setFormData({
      type: 'Found',
      title: '',
      category: '',
      location: item.location,
      contact: '',
      desc: '',
    });
    setErrors({});
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateClaimForm(claimData, claimItem);
    setClaimErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...claimData, itemId: claimItem?.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setClaimErrors(result.errors || {});
        throw new Error(result.message || 'Unable to submit your claim.');
      }
      setClaimData({ prn: '', proof: '' });
      setClaimItem(null);
      window.bootstrap.Modal.getInstance(document.getElementById('claimModal'))?.hide();
      showAlert('success', result.message);
    } catch (error) {
      showAlert('danger', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.desc.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="app-container">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top shadow-sm">
        <div className="container">
          <a className="navbar-brand fw-bold text-primary" href="#home">
            <i className="bi bi-geo-alt-fill me-1"></i>Campus<span className="text-white">Trace</span>
          </a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto align-items-lg-center">
              <li className="nav-item"><a className="nav-link active" href="#home">Home</a></li>
              <li className="nav-item"><a className="nav-link" href="#logs">Campus Logs</a></li>
              <li className="nav-item"><a className="nav-link" href="#how-it-works">How It Works</a></li>
              <li className="nav-item ms-lg-2 mt-2 mt-lg-0">
                <button className="btn btn-primary btn-sm px-3 rounded-pill" data-bs-toggle="modal" data-bs-target="#reportModal">
                  <i className="bi bi-plus-lg me-1"></i> Report Item
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <header id="home" className="hero-section text-center text-lg-start">
        <div className="container">
          <div className="row align-items-center gy-4">
            <div className="col-lg-7">
              <span className="badge bg-info text-dark mb-3 px-3 py-2 rounded-pill">Node.js Campus Application</span>
              <h1 className="display-4 fw-bold mb-3">Lost Something on Campus? We'll Help You Trace It.</h1>
              <p className="lead mb-4 text-white-50">A campus application connecting students and security to report, validate, and recover lost belongings with server-side validation.</p>
              <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center justify-content-lg-start">
                <a href="#logs" className="btn btn-light btn-lg px-4 fw-semibold text-primary">Browse Campus Logs</a>
                <button className="btn btn-outline-light btn-lg px-4 fw-semibold" data-bs-toggle="modal" data-bs-target="#reportModal">Report New Item</button>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="row g-3">
                <div className="col-6">
                  <div className="card stat-card bg-white text-dark p-3 text-center shadow-sm">
                    <i className="bi bi-box-seam text-primary display-6 mb-2"></i>
                    <h3 className="fw-bold mb-0">{items.length}</h3>
                    <small className="text-muted">Items Logged</small>
                  </div>
                </div>
                <div className="col-6">
                  <div className="card stat-card bg-white text-dark p-3 text-center shadow-sm">
                    <i className="bi bi-check-circle text-success display-6 mb-2"></i>
                    <h3 className="fw-bold mb-0">89%</h3>
                    <small className="text-muted">Recovery Rate</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="logs" className="py-5 bg-light">
        <div className="container py-4">
          {alertInfo.message && (
            <div className={`alert alert-${alertInfo.type} alert-dismissible fade show mb-4`} role="alert">
              {alertInfo.message}
              <button type="button" className="btn-close" onClick={() => setAlertInfo({ type: '', message: '' })}></button>
            </div>
          )}

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end mb-4 gap-3">
            <div>
              <h2 className="fw-bold mb-1">Campus Item Logs</h2>
              <p className="text-muted mb-0">Live search with reports stored by the Node.js server</p>
            </div>
            <button onClick={handleReset} className="btn btn-outline-danger btn-sm">
              <i className="bi bi-arrow-counterclockwise me-1"></i> Reset to Default Items
            </button>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-7">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search text-muted"></i></span>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Search by title, location, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-5">
              <select 
                className="form-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="All">All Categories</option>
                <option value="Electronics">Electronics</option>
                <option value="Stationery">Books & Stationery</option>
                <option value="Identity/Cards">ID Cards & Wallets</option>
                <option value="Keys">Keys & Lanyards</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="row g-4">
            {isLoading ? (
              <div className="col-12 text-center py-5 text-muted" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                Loading campus records...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="col-12 text-center py-5 text-muted">
                <i className="bi bi-inbox fs-1 d-block mb-2"></i>
                <h5>No matching items found</h5>
                <p className="small">Try adjusting your search or category filter.</p>
              </div>
            ) : (
              filteredItems.map(item => {
                const isLost = item.type === 'Lost';
                const isComplete = item.status === 'Complete';
                return (
                  <div key={item.id} className="col-12 col-md-6 col-lg-4">
                    <div className={`card item-card h-100 ${isLost ? 'lost-card' : 'found-card'}`}>
                      <span className={`badge status-badge ${isComplete ? 'bg-secondary' : isLost ? 'bg-danger' : 'bg-success'}`}>
                        {isComplete ? 'Complete' : item.type}
                      </span>
                      <div className="card-body p-4 d-flex flex-column">
                        <div className="mb-2 fs-4">
                          <i className={`bi ${isLost ? 'bi-search text-danger' : 'bi-check-circle text-success'}`}></i>
                        </div>
                        <h5 className="card-title fw-bold">{item.title}</h5>
                        <p className="card-text text-muted small flex-grow-1">{item.desc}</p>
                        
                        <ul className="list-unstyled text-secondary small mb-3">
                          <li><i className="bi bi-folder me-2 text-primary"></i>{item.category}</li>
                          <li><i className="bi bi-geo-alt me-2 text-danger"></i>{item.location}</li>
                          <li><i className="bi bi-telephone me-2 text-success"></i>{item.contact}</li>
                          <li><i className="bi bi-clock me-2 text-muted"></i>{item.date}</li>
                        </ul>

                        <div className="d-flex gap-2">
                          {isLost ? (
                            <button
                              className="btn btn-outline-primary btn-sm flex-grow-1"
                              data-bs-toggle="modal"
                              data-bs-target="#reportModal"
                              onClick={() => handleFoundItemReport(item)}
                            >
                              I Found This
                            </button>
                          ) : isComplete ? (
                            <button className="btn btn-secondary btn-sm flex-grow-1" type="button" disabled>
                              Claim Completed
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm flex-grow-1"
                              data-bs-toggle="modal"
                              data-bs-target="#claimModal"
                              onClick={() => {
                                setClaimItem(item);
                                setClaimErrors({});
                              }}
                            >
                              Claim Item
                            </button>
                          )}
                          <button onClick={() => handleDelete(item.id)} className="btn btn-outline-danger btn-sm" title="Delete Log">
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-5">
        <div className="container py-4 text-center">
          <h2 className="fw-bold mb-3">How CampusTrace Works</h2>
          <p className="text-muted mb-5">A Node.js server handles routing, data storage, and input validation.</p>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="p-4 rounded bg-light h-100">
                <div className="step-icon bg-primary text-white mb-3"><i className="bi bi-pencil-square fs-4"></i></div>
                <h5 className="fw-bold">1. Input Validation</h5>
                <p className="text-muted small">The server validates each report and claim before accepting it.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-4 rounded bg-light h-100">
                <div className="step-icon bg-primary text-white mb-3"><i className="bi bi-search fs-4"></i></div>
                <h5 className="fw-bold">2. Real-time Filtering</h5>
                <p className="text-muted small">GET requests load campus records; POST requests submit reports and claims.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-4 rounded bg-light h-100">
                <div className="step-icon bg-primary text-white mb-3"><i className="bi bi-shield-check fs-4"></i></div>
                <h5 className="fw-bold">3. Persistent Storage</h5>
                <p className="text-muted small">Reports and claims are saved to server-side JSON data files.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="modal fade" id="reportModal" tabIndex="-1" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-plus-circle me-2 text-primary"></i>Report an Item</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Status Type <span className="text-danger">*</span></label>
                  <select 
                    className={`form-select ${errors.type ? 'is-invalid' : ''}`}
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="" disabled>Select Status</option>
                    <option value="Lost">I Lost an Item</option>
                    <option value="Found">I Found an Item</option>
                  </select>
                  <div className="error-msg">{errors.type}</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Item Name / Title <span className="text-danger">*</span></label>
                  <input 
                    type="text" 
                    className={`form-control ${errors.title ? 'is-invalid' : ''}`}
                    name="title"
                    placeholder="e.g., MacBook Air, Keys"
                    value={formData.title}
                    onChange={handleChange}
                  />
                  <div className="error-msg">{errors.title}</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Category <span className="text-danger">*</span></label>
                  <select 
                    className={`form-select ${errors.category ? 'is-invalid' : ''}`}
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                  >
                    <option value="" disabled>Select Category</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Stationery">Books & Stationery</option>
                    <option value="Identity/Cards">ID Cards & Wallets</option>
                    <option value="Keys">Keys & Lanyards</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="error-msg">{errors.category}</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Campus Location <span className="text-danger">*</span></label>
                  <select 
                    className={`form-select ${errors.location ? 'is-invalid' : ''}`}
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                  >
                    <option value="" disabled>Select Location</option>
                    <option value="Central Library">Central Library</option>
                    <option value="Student Cafeteria">Student Cafeteria</option>
                    <option value="Sports Complex">Sports Complex</option>
                    <option value="Main Academic Building">Main Academic Building</option>
                    <option value="Hostel Block A/B">Hostel Block A/B</option>
                  </select>
                  <div className="error-msg">{errors.location}</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Contact Mobile No. <span className="text-danger">*</span></label>
                  <input 
                    type="tel" 
                    className={`form-control ${errors.contact ? 'is-invalid' : ''}`}
                    name="contact"
                    placeholder="10-digit mobile number"
                    value={formData.contact}
                    onChange={handleChange}
                  />
                  <div className="error-msg">{errors.contact}</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Description <span className="text-danger">*</span></label>
                  <textarea 
                    className={`form-control ${errors.desc ? 'is-invalid' : ''}`}
                    name="desc"
                    rows="3"
                    placeholder="Distinct features, color, brand (min 10 chars)..."
                    value={formData.desc}
                    onChange={handleChange}
                  ></textarea>
                  <div className="error-msg">{errors.desc}</div>
                </div>

                <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit & Validate Record'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="claimModal" tabIndex="-1" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-shield-lock me-2 text-success"></i>Verification Claim Request</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <p className="small text-muted">
                Claiming: <strong>{claimItem?.title ?? 'Select a found item from the campus logs.'}</strong>
              </p>
              <div className="error-msg mb-2">{claimErrors.itemId}</div>
              <p className="small text-muted">Provide your student details and ownership proof.</p>
              <form onSubmit={handleClaimSubmit} noValidate>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Student PRN / Roll No.</label>
                  <input 
                    type="text" 
                    className={`form-control ${claimErrors.prn ? 'is-invalid' : ''}`}
                    placeholder="e.g., 1032210000" 
                    value={claimData.prn}
                    onChange={(e) => {
                      setClaimData({ ...claimData, prn: e.target.value });
                      setClaimErrors((currentErrors) => ({ ...currentErrors, prn: '' }));
                    }}
                  />
                  <div className="error-msg">{claimErrors.prn}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Ownership Proof</label>
                  <textarea 
                    className={`form-control ${claimErrors.proof ? 'is-invalid' : ''}`}
                    rows="3" 
                    placeholder="Describe unique marks or lock screen wallpaper..."
                    value={claimData.proof}
                    onChange={(e) => {
                      setClaimData({ ...claimData, proof: e.target.value });
                      setClaimErrors((currentErrors) => ({ ...currentErrors, proof: '' }));
                    }}
                  ></textarea>
                  <div className="error-msg">{claimErrors.proof}</div>
                </div>
                <button type="submit" className="btn btn-success w-100 fw-bold" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Send Claim Request'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-4 border-top border-secondary bg-dark text-light text-center">
        <div className="container">
          <p className="mb-1 fw-bold">CampusTrace Node.js Application</p>
          <p className="small mb-0 text-muted">
            &copy; 2026 CampusTrace System. <a className="link-light ms-2" href="/admin">Admin</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
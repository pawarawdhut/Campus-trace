const categories = new Set(['Electronics', 'Stationery', 'Identity/Cards', 'Keys', 'Other']);
const locations = new Set([
  'Central Library',
  'Student Cafeteria',
  'Sports Complex',
  'Main Academic Building',
  'Hostel Block A/B',
]);

function readTextField(input, field, errors) {
  if (typeof input !== 'string') {
    errors[field] = 'This field is required.';
    return '';
  }
  return input.trim();
}

export function validateItem(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const item = {
    type: readTextField(source.type, 'type', errors),
    title: readTextField(source.title, 'title', errors),
    category: readTextField(source.category, 'category', errors),
    location: readTextField(source.location, 'location', errors),
    contact: readTextField(source.contact, 'contact', errors),
    desc: readTextField(source.desc, 'desc', errors),
  };

  if (item.type && !['Lost', 'Found'].includes(item.type)) errors.type = 'Select Lost or Found.';
  if (item.title.length < 3 || item.title.length > 80) errors.title = 'Title must be between 3 and 80 characters.';
  if (item.category && !categories.has(item.category)) errors.category = 'Select a valid item category.';
  if (item.location && !locations.has(item.location)) errors.location = 'Select a valid campus location.';
  if (!/^[6-9]\d{9}$/.test(item.contact)) errors.contact = 'Enter a valid 10-digit mobile number.';
  if (item.desc.length < 10 || item.desc.length > 500) errors.desc = 'Description must be between 10 and 500 characters.';

  return { data: item, errors };
}

export function validateClaim(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const claim = {
    prn: readTextField(source.prn, 'prn', errors),
    proof: readTextField(source.proof, 'proof', errors),
  };

  if (!/^[a-zA-Z0-9-]{5,20}$/.test(claim.prn)) {
    errors.prn = 'Enter a PRN or roll number between 5 and 20 letters, numbers, or hyphens.';
  }
  if (claim.proof.length < 10 || claim.proof.length > 500) {
    errors.proof = 'Ownership proof must be between 10 and 500 characters.';
  }

  return { data: claim, errors };
}

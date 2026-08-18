/* =====================================================================
   CONFIGURATION — point this at your Google Sheet
   =====================================================================
   1. Open your Google Sheet.
   2. Share it: "Anyone with the link" → Viewer.
   3. Copy the ID out of the sheet's URL:
      https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
   4. Paste it below. Also set SHEET_NAME to the tab (bottom-of-screen)
      that holds the tutor data.

   Expected columns in that tab (any order, header names are matched
   loosely — "Photo URL", "photo_url", "Image" all work):
     Name        - tutor's full name
     Photo       - a direct image URL, or a Google Drive share link
     Subjects    - comma-separated, e.g. "SAT, AP Calculus BC, Algebra 2"
     Bio         - a sentence or two
     Booking URL - link to that tutor's booking page

   NOTE ON HOW THIS LOADS DATA: it uses a JSONP <script> tag rather than
   fetch(). Google's sheet-export endpoint doesn't send the CORS headers
   a fetch()/XHR call needs, so fetch() silently fails on any domain
   other than Google's own — that was the bug in the previous version.
   Script-tag loading isn't subject to that restriction, so this works
   from any host (or from a local file).
   ===================================================================== */
const SHEET_ID = '1plPGPgXPfol9-KCMQf4pl3EjPNn1DGJ_jHACltrXsPI';
const SHEET_NAME = 'Tutors';
/* ===================================================================== */

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
  '/gviz/tq?sheet=' + encodeURIComponent(SHEET_NAME) + '&headers=1';

const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">' +
  '<rect width="100%" height="100%" fill="#d7dee6"/>' +
  '<text x="50%" y="50%" font-size="18" fill="#4a5a72" text-anchor="middle" dy=".3em">No Photo</text></svg>';
const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(FALLBACK_SVG);

function getField_(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const key = keys.find(function (k) {
      return k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === cand;
    });
    if (key && row[key]) return String(row[key]).trim();
  }
  return '';
}

// Converts a Google Drive share link into a hotlink-friendly image URL.
// Leaves any other URL (Imgur, your own hosting, etc.) untouched.
function toDirectImageUrl_(url) {
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*?id=)([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w500';
  return url;
}

// Converts the raw gviz table ({cols:[...], rows:[...]}) into plain
// objects keyed by column header, e.g. { Name: 'Jo', Subjects: 'SAT' }.
function parseGvizTable_(table) {
  const headers = table.cols.map(function (c) { return c.label || c.id || ''; });
  return table.rows.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      const cell = row.c && row.c[i];
      let val = '';
      if (cell) {
        val = (cell.f !== undefined && cell.f !== null) ? cell.f : cell.v;
      }
      obj[h] = (val === null || val === undefined) ? '' : val;
    });
    return obj;
  });
}

// Loads the sheet via a JSONP <script> tag (see note above) and resolves
// with an array of row objects.
function fetchTutorRows_() {
  if (!SHEET_ID || SHEET_ID === 'PASTE_YOUR_SHEET_ID_HERE') {
    return Promise.reject(new Error('Set SHEET_ID in tutors-data.js to your Google Sheet\u2019s ID first.'));
  }

  return new Promise(function (resolve, reject) {
    const callbackName = 'tutorDataCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    let done = false;

    function cleanup() {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    }

    window[callbackName] = function (response) {
      if (done) return;
      done = true;
      cleanup();
      if (response.status === 'error') {
        const detail = (response.errors && response.errors[0] && response.errors[0].detailed_message) ||
          'Access denied — make sure the sheet is shared as "Anyone with the link".';
        reject(new Error(detail));
        return;
      }
      resolve(parseGvizTable_(response.table));
    };

    const script = document.createElement('script');
    script.src = SHEET_URL + '&tqx=out:json;responseHandler:' + callbackName;
    script.onerror = function () {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Could not reach the sheet. Check SHEET_ID/SHEET_NAME in tutors-data.js and your connection.'));
    };
    document.body.appendChild(script);

    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Timed out waiting for the sheet. Check that SHEET_ID and SHEET_NAME are correct, and that the sheet is shared.'));
    }, 10000);
  });
}

async function fetchTutors() {
  const rows = await fetchTutorRows_();
  return rows
    .map(function (row) {
      const name = getField_(row, ['name']);
      const photoRaw = getField_(row, ['photo', 'photourl', 'image', 'imageurl']);
      const subjectsRaw = getField_(row, ['subjects', 'subject']);
      const bio = getField_(row, ['bio', 'biography', 'about']);
      const bookingUrl = getField_(row, ['bookingurl', 'bookinglink', 'booking', 'link', 'url']);
      return {
        name: name,
        photo: toDirectImageUrl_(photoRaw),
        subjects: subjectsRaw ? subjectsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
        bio: bio,
        bookingUrl: bookingUrl
      };
    })
    .filter(function (t) { return t.name; }); // drop blank rows
}

function createTutorCard(tutor) {
  const card = document.createElement('div');
  card.className = 'tutor-card';

  const img = document.createElement('img');
  img.className = 'tutor-photo';
  img.src = tutor.photo || FALLBACK_IMAGE;
  img.alt = tutor.name;
  img.loading = 'lazy';
  img.addEventListener('error', function () { img.src = FALLBACK_IMAGE; });
  card.appendChild(img);

  const body = document.createElement('div');
  body.className = 'tutor-body';

  const name = document.createElement('h3');
  name.textContent = tutor.name;
  body.appendChild(name);

  if (tutor.subjects.length) {
    const subjects = document.createElement('div');
    subjects.className = 'tutor-subjects';
    tutor.subjects.forEach(function (s) {
      const tag = document.createElement('span');
      tag.className = 'subject-tag';
      tag.textContent = s;
      subjects.appendChild(tag);
    });
    body.appendChild(subjects);
  }

  if (tutor.bio) {
    const bio = document.createElement('p');
    bio.className = 'tutor-bio';
    bio.textContent = tutor.bio;
    body.appendChild(bio);
  }

  const btn = document.createElement('a');
  btn.className = 'btn';
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  const firstName = tutor.name.split(' ')[0] || tutor.name;
  if (tutor.bookingUrl) {
    btn.textContent = 'Book with ' + firstName;
    btn.href = tutor.bookingUrl;
  } else {
    btn.textContent = 'Booking link coming soon';
    btn.href = '#';
    btn.classList.add('disabled');
    btn.addEventListener('click', function (e) { e.preventDefault(); });
  }
  body.appendChild(btn);

  card.appendChild(body);
  return card;
}

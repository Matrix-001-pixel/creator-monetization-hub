const API_BASE = 'https://creator-monetization-hub-2.onrender.com/api';
const token = localStorage.getItem('authToken');

if (!token) {
  window.location.href = 'login.html';
}

document.getElementById('launch-monetization')?.addEventListener('click', () => {
  const offers = document.getElementById('offers');
  if (offers) {
    offers.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

document.getElementById('connect-account-btn')?.addEventListener('click', async (e) => {
  e.preventDefault();

  const form = document.querySelector('.link-form');
  const platform = form.querySelector('select').value;
  const username = form.querySelector('input[type="text"]').value.trim();
  const followerCount = Number(form.querySelector('input[type="number"]').value || 0);
  const profileUrl = form.querySelector('input[type="url"]').value.trim();

  if (!username) {
    alert('Please enter a username');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/social/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        platform,
        username,
        followerCount,
        url: profileUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to connect account');
    }

    alert(`Connected ${platform} successfully!\nTotal followers: ${data.followerTotal}\nStatus: ${data.verificationStatus}`);
    form.reset();
    loadConnectedAccounts();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

async function loadConnectedAccounts() {
  try {
    const response = await fetch(`${API_BASE}/social/accounts`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return;

    const data = await response.json();
    const list = document.querySelector('.connected-list');

    if (!list) return;

    if (!data.accounts || data.accounts.length === 0) {
      list.innerHTML = '<p>No connected accounts yet.</p>';
      return;
    }

    list.innerHTML = data.accounts.map(account => `
      <div class="connected-item">
        <div>
          <strong>${account.platform}</strong>
          <small>${account.username}</small>
        </div>
        <span>${account.follower_count} followers</span>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

loadConnectedAccounts();

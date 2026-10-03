const grossInput = document.getElementById('gross-amount');
const feeValue = document.getElementById('fee-value');
const payoutValue = document.getElementById('payout-value');

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function updateEstimator() {
  const amount = Number(grossInput.value || 0);
  const commission = amount * 0.1;
  const payout = amount - commission;

  feeValue.textContent = formatCurrency(commission);
  payoutValue.textContent = formatCurrency(payout);
}

grossInput.addEventListener('input', updateEstimator);
updateEstimator();

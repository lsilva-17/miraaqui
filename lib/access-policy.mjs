// Apply the same domain rule to new accounts, sign-in and existing sessions.
export function allowedEmail(email){
  return typeof email==='string'&&/^[^\s@]+@caaqui\.com$/i.test(email.trim());
}

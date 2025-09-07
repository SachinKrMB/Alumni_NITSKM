// lib/avatar.js

function getInitials(name = "User") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarStyle(name = "User") {
  const colors = ["#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#F472B6"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return `background-color:${bg};color:white;display:flex;align-items:center;justify-content:center;
          border-radius:50%;font-weight:bold;font-size:14px;`;
}

module.exports = { getInitials, getAvatarStyle };

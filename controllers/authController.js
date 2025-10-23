const jwt = require("jsonwebtoken");
// username -> { uid, username, passwordHash }
const users = new Map(); 
let uidSeq = 1;

function signToken(user) {
  return jwt.sign(
    { uid: user.uid, username: user.username, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

exports.register = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok:false, message:"username & password required" });
  }
  if (users.has(username)) {
    return res.status(409).json({ ok:false, message:"User already exists" });
  }
  const user = { uid: "u" + (uidSeq++), username, passwordHash: password };
  users.set(username, user);
  return res.status(201).json({ ok:true, uid: user.uid, username: user.username });
};

exports.login = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok:false, message:"username & password required" });
  }
  const user = users.get(username);
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({ ok:false, message:"Invalid credentials" });
  }
  const token = signToken(user);
  return res.json({ ok:true, token, uid: user.uid, username: user.username });
};

exports.me = async (req, res) => {
  return res.json({
    ok: true,
    uid: req.user.uid,
    username: req.user.username || "User",
    role: req.user.role || "user",
  });
};

const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { db } = require("./db");

function generateCode(length = 7) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function seed() {
  const hash = await bcrypt.hash("personally", 10);

  // Admin user
  const adminId = "admin-root";
  await db.run(
    `INSERT INTO users (id, phone, name, password_hash, wallet_balance, referral_code, is_admin)
     VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT (id) DO NOTHING`,
    adminId, "08123456789", "Administrator", hash, 3000, generateCode()
  );

  // Products
  const products = [
    {
      id: "YBUKIPXJ5G", name: "Seedling",
      desc: "Plant your first seed. A gentle entry plan that grows your wallet with steady daily returns.",
      img: "https://images.unsplash.com/photo-1557234195-bd9f290f0e4d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxzZWVkbGluZyUyMGVtZXJnaW5nJTIwc29pbHxlbnwwfHx8fDE3ODEzMzY1NTl8MA&ixlib=rb-4.1.0&q=85",
      price: 3000, profit: 25, days: 30
    },
    {
      id: "K0K2MRYU9M", name: "Sprout",
      desc: "Your money breaks ground. Watch your Sprout take root with reliable daily yields.",
      img: "https://images.unsplash.com/photo-1593850685398-e79bab596d1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtaWNyb2dyZWVucyUyMGdyb3dpbmd8ZW58MHx8fHwxNzgxMzM2NTc4fDA&ixlib=rb-4.1.0&q=85",
      price: 5000, profit: 25, days: 30
    },
    {
      id: "3UYD576J0J", name: "Sapling",
      desc: "Stronger roots, bigger returns. The Sapling plan gives your capital room to stretch.",
      img: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxwbGFudCUyMGdyb3d0aHxlbnwwfHx8fDE3ODEzMzY2MDR8MA&ixlib=rb-4.1.0&q=85",
      price: 15000, profit: 25, days: 30
    },
    {
      id: "X8PLMN2K5W", name: "Evergreen",
      desc: "Perennial wealth. The Evergreen plan delivers sustained high-value returns.",
      img: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80",
      price: 50000, profit: 30, days: 45
    },
  ];

  for (const p of products) {
    await db.run(
      `INSERT INTO products (id, name, description, image_url, price, daily_profit_percent, daily_profit_amount, duration_days, min_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      p.id, p.name, p.desc, p.img, p.price, p.profit, p.price * p.profit / 100, p.days, p.price
    );
  }

  // Default settings
  const settings = {
    "site_name": "Furgle",
    "allow_bank_change": "true",
    "deposit_gateway": "paystack",
    "payout_gateway": "nomba",
    "paystack_public_key": "pk_live_0be34c3f2d36cc941a013150421fe0c14f67f870",
    "paystack_secret_key": "",
    "gen1_percent": "20",
    "gen2_percent": "3",
    "withdrawals_open": "true",
    "withdrawal_start_time": "10:30",
    "withdrawal_end_time": "18:00",
    "withdrawal_fee_percent": "15",
    "max_withdrawal": "500000",
    "daily_claim_enabled": "true",
    "daily_claim_amount": "100",
    "telegram_url": "",
    "telegram_group_url": "",
    "welcome_modal_active": "true",
    "require_withdrawal_pin": "false",
    "quick_deposit_amounts": "[3000,5000,10000,25000,50000,100000]",
    "referral_commission_mode": "first_only",
    "referral_commission_cap_n": "3",
    "home_secondary_section_enabled": "true",
    "home_plans_count": "0",
    "gateway_paystack_enabled": "true",
    "gateway_nomba_enabled": "false",
    "gateway_marasoft_enabled": "false",
    "gateway_budpay_enabled": "false",
    "gateway_qorepay_enabled": "false",
    "gateway_kora_enabled": "false",
    "auto_payout_enabled": "false",
    "deposit_bonus_percent": "0",
    "let_users_choose_gateway": "false",
    "multi_gateway_enabled": "false",
    "require_security_questions": "false",
    "payment_mode": "live",
  };

  for (const [k, v] of Object.entries(settings)) {
    await db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING",
      k, v
    );
  }

  // Sample coupon
  await db.run(
    "INSERT INTO coupons (id, code, amount, max_uses, is_active) VALUES (?, ?, ?, ?, 1) ON CONFLICT (code) DO NOTHING",
    "coup_" + uuidv4().slice(0, 8), "NJW8VZQY", 100, 100
  );

  console.log("Database seeded successfully");
}

module.exports = { seed };

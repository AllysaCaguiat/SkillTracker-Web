// Optional, for development only. Do not seed shared demonstration passwords in production.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {rows, db} from './db.js';
if(process.env.NODE_ENV==='production'||process.env.VERCEL==='1') throw Error('Demo seeding disabled in production');
const users=[['Administrator','admin@skilltrack.test','admin'],['Demo Instructor','teacher@skilltrack.test','instructor'],['Demo Student','student@skilltrack.test','student']];
try {
 for(const [name,email,role] of users){const hash=await bcrypt.hash('Password123!',12);await rows('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?) ON CONFLICT (email) DO NOTHING',[name,email,hash,role])}
 console.log('Demo accounts created (development only).');
} finally {await db.end()}

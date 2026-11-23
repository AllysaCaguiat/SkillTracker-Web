import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { randomBytes, createHash } from 'node:crypto';
import { db, rows } from './db.js';

if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) 
    { console.error('Set JWT_SECRET to a random string of at least 32 characters in server/.env'); throw new Error('JWT_SECRET must be set to a random 32+ character secret');

     }
const app=express();
app.use(helmet()); 
app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173'}));
 app.use(express.json({limit:'1mb'}));
app.use('/api/auth',
    rateLimit({windowMs:15*60*1000,limit:40,
        standardHeaders:'draft-7',legacyHeaders:false}));
// Handle asynchronous Express routes and middleware
const run = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
};
const error=(res,status,message)=>res.status(status).json({error:message});
const tokenFor=u=>jwt.sign({id:u.id,role:u.role},
    process.env.JWT_SECRET,{expiresIn:'7d'});
const auth=run
(async(req,res,next)=>{const 
    token=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(!token)return error(res,401,'Please log in');let decoded;
    try{decoded=jwt.verify(token,process.env.JWT_SECRET)}
    catch{return error(res,401,'Session expired. Please log in again')};
    const users=await
     rows('SELECT id,name,email,role,created_at FROM users WHERE id=? AND active=TRUE',
        [decoded.id]);if(!users.length)return error(res,401,'Account not found');req.user=users[0];next()});
const allow=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():error(res,403,'Access denied');
const text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
const int=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
const mine=async(courseId,user)=>{const c=await rows('SELECT * FROM courses WHERE id=?',[courseId]);return c.length && (user.role==='admin'||c[0].instructor_id===user.id)?c[0]:null};
const enrolled=async(courseId,user)=>{if(await mine(courseId,user))return true;const e=await rows('SELECT id FROM enrollments WHERE user_id=? AND course_id=?',[user.id,courseId]);return !!e.length};
app.get('/api/health',run(async(req,res)=>{await rows('SELECT 1 AS ok');res.json({status:'ok',database:'connected'})}));
// Set up the first administrator securely through /setup (browser only).
// Once an admin exists, this endpoint is permanently disabled.
app.post('/api/setup/first-admin', rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),run(async(req,res)=>{
  const key = process.env.SETUP_KEY;
  if (!key || key.length < 24) return error(res,503,'SETUP_KEY must be configured in Vercel (24+ characters)');
  const supplied=typeof req.body.setupKey==='string'?req.body.setupKey:'';
  const crypto=await import('node:crypto');
  const a=Buffer.from(supplied), b=Buffer.from(key);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return error(res,403,'Invalid setup key');
  const exists=await rows("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if(exists.length) return error(res,409,'An administrator already exists. Use normal sign-in.');
  const name=text(req.body.name,120), email=text(req.body.email,190).toLowerCase(), password=req.body.password;
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password!=='string' || password.length<12)
    return error(res,400,'Enter a name, valid email and a password of at least 12 characters');
  const hash=await bcrypt.hash(password,12);
  try {
    const r=await rows("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')",[name,email,hash]);
    const user={id:r.insertId,name,email,role:'admin'};
    res.status(201).json({token:tokenFor(user),user});
  } catch(e) { if(e.code==='23505') return error(res,409,'Email already exists'); throw e; }
}));
app.post('/api/auth/register',run(async(req,res)=>{const name=text(req.body.name,120),email=text(req.body.email,190).toLowerCase(),password=req.body.password;if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||password.length<8)return error(res,400,'Enter a name, valid email, and password of at least 8 characters');const hash=await bcrypt.hash(password,12);try{const r=await rows('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,"student")',[name,email,hash]);const user={id:r.insertId,name,email,role:'student'};res.status(201).json({token:tokenFor(user),user})}catch(e){if(e.code==='23505')return error(res,409,'Email already registered');throw e}}));
app.post('/api/auth/login',run(async(req,res)=>{const email=text(req.body.email,190).toLowerCase();const u=(await rows('SELECT * FROM users WHERE email=?',[email]))[0];if(!u||!u.active||!await bcrypt.compare(String(req.body.password||''),u.password_hash))return error(res,401,'Incorrect email or password');const user={id:u.id,name:u.name,email:u.email,role:u.role};res.json({token:tokenFor(user),user})}));
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/dashboard',auth,run(async(req,res)=>{const u=req.user;let stats;if(u.role==='student'){const [[s]] = await db.query(`SELECT (SELECT COUNT(*) FROM enrollments WHERE user_id=?) enrolled,(SELECT COUNT(*) FROM lesson_progress WHERE user_id=?) completed,(SELECT COUNT(*) FROM quiz_attempts WHERE user_id=?) attempts`,[u.id,u.id,u.id]);stats=s}else if(u.role==='instructor'){const [[s]]=await db.query(`SELECT (SELECT COUNT(*) FROM courses WHERE instructor_id=?) courses,(SELECT COUNT(*) FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE c.instructor_id=?) students,(SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id=l.course_id WHERE c.instructor_id=?) lessons`,[u.id,u.id,u.id]);stats=s}else{const [[s]]=await db.query('SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM courses) courses,(SELECT COUNT(*) FROM enrollments) enrollments');stats=s}res.json({stats})}));
app.get('/api/courses',auth,run(async(req,res)=>{const showMine=req.query.mine==='1';const list=await rows(`SELECT c.*,u.name instructor_name,(SELECT COUNT(*) FROM lessons WHERE course_id=c.id) lesson_count,(SELECT COUNT(*) FROM enrollments WHERE course_id=c.id) student_count, EXISTS(SELECT 1 FROM enrollments WHERE course_id=c.id AND user_id=?) enrolled FROM courses c JOIN users u ON u.id=c.instructor_id WHERE ${showMine && req.user.role==='instructor'?'c.instructor_id=?':showMine && req.user.role==='admin'?'1=1':'c.published=1'} ORDER BY c.created_at DESC`,showMine&&req.user.role==='instructor'?[req.user.id,req.user.id]:[req.user.id]);res.json({courses:list})}));
app.post('/api/courses',auth,allow('instructor','admin'),run(async(req,res)=>{const title=text(req.body.title,180),description=text(req.body.description,5000),category=text(req.body.category,80)||'General',level=req.body.level;if(title.length<3||description.length<10||!['Beginner','Intermediate','Advanced'].includes(level))return error(res,400,'Provide a title, description (10+ characters) and level');const r=await rows('INSERT INTO courses(instructor_id,title,description,category,level,published) VALUES(?,?,?,?,?,0)',[req.user.id,title,description,category,level]);res.status(201).json({id:r.insertId})}));
app.get('/api/courses/:id',auth,run(async(req,res)=>{const id=int(req.params.id);if(!id)return error(res,400,'Invalid course');const cc=await rows('SELECT c.*,u.name instructor_name FROM courses c JOIN users u ON u.id=c.instructor_id WHERE c.id=?',[id]);if(!cc.length)return error(res,404,'Course not found');const owner=!!await mine(id,req.user);if(!cc[0].published&&!owner)return error(res,404,'Course not found');const access=await enrolled(id,req.user);const lessons=await rows('SELECT id,course_id,title,position,video_url FROM lessons WHERE course_id=? ORDER BY position,id',[id]);const progress=access?await rows('SELECT lp.lesson_id FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE lp.user_id=? AND l.course_id=?',[req.user.id,id]):[];const quiz=(await rows('SELECT id,title,pass_percentage,(SELECT COUNT(*) FROM questions WHERE quiz_id=quizzes.id) question_count FROM quizzes WHERE course_id=?',[id]))[0]||null;const attempt=quiz?(await rows('SELECT score,total,percentage,submitted_at FROM quiz_attempts WHERE quiz_id=? AND user_id=? ORDER BY id DESC LIMIT 1',[quiz.id,req.user.id]))[0]||null:null;res.json({course:cc[0],lessons,completed:progress.map(x=>x.lesson_id),quiz,attempt,canAccess:access,isOwner:owner})}));
app.patch('/api/courses/:id',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);if(!await mine(id,req.user))return error(res,403,'Not your course');const title=text(req.body.title,180),description=text(req.body.description,5000),category=text(req.body.category,80)||'General',level=req.body.level,published=req.body.published===true;if(title.length<3||description.length<10||!['Beginner','Intermediate','Advanced'].includes(level))return error(res,400,'Invalid course details');await rows('UPDATE courses SET title=?,description=?,category=?,level=?,published=? WHERE id=?',[title,description,category,level,published,id]);res.json({message:'Course updated'})}));
app.delete('/api/courses/:id',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);if(!await mine(id,req.user))return error(res,403,'Not your course');await rows('DELETE FROM courses WHERE id=?',[id]);res.json({message:'Course deleted'})}));
app.post('/api/courses/:id/enroll',auth,allow('student'),run(async(req,res)=>{const id=int(req.params.id);const c=await rows('SELECT id FROM courses WHERE id=? AND published=1',[id]);if(!c.length)return error(res,404,'Course not available');await rows('INSERT IGNORE INTO enrollments(user_id,course_id) VALUES(?,?)',[req.user.id,id]);res.json({message:'Enrolled successfully'})}));
app.get('/api/learning',auth,run(async(req,res)=>{const courses=await rows(`SELECT c.id,c.title,c.category,c.level,u.name instructor_name,(SELECT COUNT(*) FROM lessons WHERE course_id=c.id) total_lessons,(SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.course_id=c.id AND lp.user_id=?) completed_lessons FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN users u ON u.id=c.instructor_id WHERE e.user_id=? ORDER BY e.enrolled_at DESC`,[req.user.id,req.user.id]);res.json({courses})}));
app.post('/api/courses/:id/lessons',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);if(!await mine(id,req.user))return error(res,403,'Not your course');const title=text(req.body.title,180),content=text(req.body.content,50000),video=text(req.body.video_url,600);if(title.length<3||content.length<5||video&&!/^https?:\/\//i.test(video))return error(res,400,'Provide lesson title, content, and optional valid video URL');const max=(await rows('SELECT COALESCE(MAX(position),0) as p FROM lessons WHERE course_id=?',[id]))[0].p;const r=await rows('INSERT INTO lessons(course_id,title,content,video_url,position) VALUES(?,?,?,?,?)',[id,title,content,video||null,max+1]);res.status(201).json({id:r.insertId})}));
app.get('/api/lessons/:id',auth,run(async(req,res)=>{const id=int(req.params.id);const ll=await rows('SELECT * FROM lessons WHERE id=?',[id]);if(!ll.length)return error(res,404,'Lesson not found');if(!await enrolled(ll[0].course_id,req.user))return error(res,403,'Enroll to view this lesson');res.json({lesson:ll[0]})}));
app.patch('/api/lessons/:id',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);const ll=await rows('SELECT * FROM lessons WHERE id=?',[id]);if(!ll.length)return error(res,404,'Lesson not found');if(!await mine(ll[0].course_id,req.user))return error(res,403,'Not your course');const title=text(req.body.title,180),content=text(req.body.content,50000),video=text(req.body.video_url,600);if(title.length<3||content.length<5||video&&!/^https?:\/\//i.test(video))return error(res,400,'Invalid lesson');await rows('UPDATE lessons SET title=?,content=?,video_url=? WHERE id=?',[title,content,video||null,id]);res.json({message:'Lesson updated'})}));
app.delete('/api/lessons/:id',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);const ll=await rows('SELECT * FROM lessons WHERE id=?',[id]);if(!ll.length)return error(res,404,'Lesson not found');if(!await mine(ll[0].course_id,req.user))return error(res,403,'Not your course');await rows('DELETE FROM lessons WHERE id=?',[id]);res.json({message:'Lesson deleted'})}));
app.post('/api/lessons/:id/complete',auth,allow('student'),run(async(req,res)=>{const id=int(req.params.id);const ll=await rows('SELECT course_id FROM lessons WHERE id=?',[id]);if(!ll.length)return error(res,404,'Lesson not found');if(!await enrolled(ll[0].course_id,req.user))return error(res,403,'Enroll first');await rows('INSERT IGNORE INTO lesson_progress(user_id,lesson_id) VALUES(?,?)',[req.user.id,id]);res.json({message:'Lesson completed'})}));
app.get('/api/courses/:id/quiz',auth,run(async(req,res)=>{const id=int(req.params.id);if(!await enrolled(id,req.user))return error(res,403,'Enroll first');const quiz=(await rows('SELECT * FROM quizzes WHERE course_id=?',[id]))[0];if(!quiz)return error(res,404,'No quiz yet');const owner=!!await mine(id,req.user);const questions=await rows(`SELECT id,prompt,option_a,option_b,option_c,option_d ${owner?',correct_option':''} FROM questions WHERE quiz_id=? ORDER BY id`,[quiz.id]);res.json({quiz,questions})}));
app.put('/api/courses/:id/quiz',auth,allow('instructor','admin'),run(async(req,res)=>{const id=int(req.params.id);if(!await mine(id,req.user))return error(res,403,'Not your course');const title=text(req.body.title,180),pass=Number(req.body.pass_percentage),qs=req.body.questions;if(title.length<3||!Number.isInteger(pass)||pass<0||pass>100||!Array.isArray(qs)||qs.length<1||qs.length>50)return error(res,400,'Quiz needs a title, passing percentage and 1–50 questions');for(const q of qs){if(!text(q.prompt,2000)||!['A','B','C','D'].includes(q.correct_option)||['option_a','option_b','option_c','option_d'].some(k=>!text(q[k],500)))return error(res,400,'Every question requires four choices and a correct answer')};const conn=await db.getConnection();try{await conn.beginTransaction();const [[old]]=await conn.query('SELECT id FROM quizzes WHERE course_id=?',[id]);let qid;if(old){qid=old.id;await conn.execute('UPDATE quizzes SET title=?,pass_percentage=? WHERE id=?',[title,pass,qid]);await conn.execute('DELETE FROM questions WHERE quiz_id=?',[qid])}else{const [result]=await conn.execute('INSERT INTO quizzes(course_id,title,pass_percentage) VALUES(?,?,?)',[id,title,pass]);qid=result.insertId}for(const q of qs)await conn.execute('INSERT INTO questions(quiz_id,prompt,option_a,option_b,option_c,option_d,correct_option) VALUES(?,?,?,?,?,?,?)',[qid,text(q.prompt,2000),text(q.option_a,500),text(q.option_b,500),text(q.option_c,500),text(q.option_d,500),q.correct_option]);await conn.commit();res.json({message:'Quiz saved',id:qid})}catch(e){await conn.rollback();throw e}finally{conn.release()}}));
app.post('/api/courses/:id/quiz/submit',auth,allow('student'),run(async(req,res)=>{const id=int(req.params.id);if(!await enrolled(id,req.user))return error(res,403,'Enroll first');const quiz=(await rows('SELECT * FROM quizzes WHERE course_id=?',[id]))[0];if(!quiz)return error(res,404,'No quiz');const questions=await rows('SELECT id,correct_option FROM questions WHERE quiz_id=?',[quiz.id]);if(!questions.length)return error(res,400,'Quiz has no questions');const submitted=req.body.answers;if(typeof submitted!=='object'||!submitted||Array.isArray(submitted))return error(res,400,'Answers are required');let score=0;const checked={};for(const q of questions){const answer=submitted[String(q.id)];if(!['A','B','C','D'].includes(answer))return error(res,400,'Answer all questions');checked[q.id]=answer;if(answer===q.correct_option)score++}const percentage=Math.round(score/questions.length*100);await rows('INSERT INTO quiz_attempts(quiz_id,user_id,score,total,percentage,answers_json) VALUES(?,?,?,?,?,?)',[quiz.id,req.user.id,score,questions.length,percentage,JSON.stringify(checked)]);res.json({score,total:questions.length,percentage,passed:percentage>=quiz.pass_percentage,pass_percentage:quiz.pass_percentage})}));

// Admin-issued, single-use instructor invitations. Run the accompanying Neon migration first.
const invitationLimiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
const hashToken=t=>createHash('sha256').update(t).digest('hex');
const origin=()=>{const url=process.env.PUBLIC_APP_URL;if(!url||!/^https:\/\/[^/]+$/.test(url))throw new Error('PUBLIC_APP_URL must be an HTTPS origin without trailing slash');return url};
async function sendInvitation(email,name,token){
  if(!process.env.RESEND_API_KEY||!process.env.INVITE_FROM_EMAIL)throw new Error('Email delivery not configured');
  const url=origin()+'/activate?token='+encodeURIComponent(token);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.INVITE_FROM_EMAIL,to:[email],subject:'Activate your SkillTracker Instructor account',text:`Hello ${name},\n\nYour Instructor account has been invited to SkillTracker. Set your password using this one-time link (expires in 24 hours):\n${url}\n\nIf you did not expect this, ignore this email.`})});
  if(!response.ok)throw new Error('Email provider rejected the invitation (check Resend configuration)');
}
app.post('/api/admin/instructors/invite',auth,allow('admin'),invitationLimiter,run(async(req,res)=>{
  const name=text(req.body.name,120),email=text(req.body.email,190).toLowerCase();
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error(res,400,'Enter an instructor name and valid email');
  if(!process.env.RESEND_API_KEY||!process.env.INVITE_FROM_EMAIL||!process.env.PUBLIC_APP_URL)return error(res,503,'Configure RESEND_API_KEY, INVITE_FROM_EMAIL and PUBLIC_APP_URL first');
  const token=randomBytes(32).toString('hex');
  const existing=await rows('SELECT id FROM users WHERE email=?',[email]);
  if(existing.length)return error(res,409,'Email is already registered. Use an unregistered email.');
  const client=await db.getConnection();let id;
  try{await client.beginTransaction();
    const placeholder=await bcrypt.hash(randomBytes(32).toString('hex'),12);
    const [created]=await client.query("INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,'instructor',FALSE)",[name,email,placeholder]);id=created.insertId;
    await client.query("INSERT INTO instructor_invitations(user_id,token_hash,expires_at) VALUES(?,?,NOW() + INTERVAL '24 hours')",[id,hashToken(token)]);
    await sendInvitation(email,name,token);
    await client.commit();
  }catch(e){await client.rollback();if(e.code==='23505')return error(res,409,'Email already registered');throw e}finally{client.release()}
  res.status(201).json({message:'Invitation email sent',id});
}));
app.post('/api/admin/instructors/:id/resend',auth,allow('admin'),invitationLimiter,run(async(req,res)=>{
  const id=int(req.params.id),users=await rows("SELECT id,name,email,active FROM users WHERE id=? AND role='instructor'",[id]);
  if(!users.length)return error(res,404,'Instructor not found');if(users[0].active)return error(res,409,'Instructor is already activated');
  if(!process.env.RESEND_API_KEY||!process.env.INVITE_FROM_EMAIL||!process.env.PUBLIC_APP_URL)return error(res,503,'Email delivery not configured');
  const token=randomBytes(32).toString('hex');
  // Only replace the previous token after successful delivery.
  await sendInvitation(users[0].email,users[0].name,token);
  await rows('DELETE FROM instructor_invitations WHERE user_id=?',[id]);
  await rows("INSERT INTO instructor_invitations(user_id,token_hash,expires_at) VALUES(?,?,NOW() + INTERVAL '24 hours')",[id,hashToken(token)]);
  res.json({message:'Invitation resent'});
}));
app.patch('/api/admin/instructors/:id/status',auth,allow('admin'),run(async(req,res)=>{
  const id=int(req.params.id),active=req.body.active;
  if(typeof active!=='boolean')return error(res,400,'Invalid status');
  const result=await rows("UPDATE users SET active=? WHERE id=? AND role='instructor'",[active,id]);
  if(!result.affectedRows)return error(res,404,'Instructor not found');
  res.json({message:active?'Instructor activated':'Instructor deactivated'});
}));
app.post('/api/auth/activate-instructor',invitationLimiter,run(async(req,res)=>{
  const token=req.body.token,password=req.body.password;
  if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token)||typeof password!=='string'||password.length<12||password.length>128)return error(res,400,'Invalid invitation or password (12–128 characters required)');
  const client=await db.getConnection();
  try{await client.beginTransaction();
    const [found]=await client.query("SELECT i.id,i.user_id FROM instructor_invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>NOW() AND u.role='instructor' AND u.active=FALSE FOR UPDATE",[hashToken(token)]);
    if(!found.length){await client.rollback();return error(res,400,'Invitation is invalid, expired or already used')}
    const passwordHash=await bcrypt.hash(password,12);
    await client.query('UPDATE users SET password_hash=?,active=TRUE WHERE id=?',[passwordHash,found[0].user_id]);
    await client.query('UPDATE instructor_invitations SET used_at=NOW() WHERE id=?',[found[0].id]);
    await client.commit();res.json({message:'Account activated. You can now sign in.'});
  }catch(e){await client.rollback();throw e}finally{client.release()}
}));
app.get('/api/admin/users',auth,allow('admin'),run(async(req,res)=>{const users=await rows('SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC');res.json({users})}));
app.patch('/api/admin/users/:id/role',auth,allow('admin'),run(async(req,res)=>{const id=int(req.params.id),role=req.body.role;if(role!=='student')return error(res,400,'Invalid role');if(id===req.user.id)return error(res,400,'You cannot change your own role');const result=await rows('UPDATE users SET role=? WHERE id=?',[role,id]);if(!result.affectedRows)return error(res,404,'User not found');res.json({message:'Role updated'})}));
// Admin-only account controls. Preserve records by permitting permanent deletion
// only when the account has no learning activity or authored courses.
app.patch('/api/admin/users/:id/status',auth,allow('admin'),run(async(req,res)=>{
  const id=int(req.params.id),active=req.body?.active;
  if(!id||typeof active!=='boolean')return error(res,400,'Invalid account or status');
  if(id===req.user.id)return error(res,403,'You cannot change your own account status');
  const found=await rows('SELECT id,role FROM users WHERE id=?',[id]);
  if(!found.length)return error(res,404,'Account not found');
  if(found[0].role==='admin')return error(res,403,'Administrator accounts are protected');
  if(found[0].role==='instructor'&&active){
    const pending=await rows('SELECT id FROM instructor_invitations WHERE user_id=? AND used_at IS NULL',[id]);
    if(pending.length)return error(res,409,'Pending instructor must activate through the email invitation');
  }
  await rows('UPDATE users SET active=? WHERE id=?',[active,id]);
  res.json({message:active?'Account activated':'Account deactivated'});
}));
app.delete('/api/admin/users/:id',auth,allow('admin'),run(async(req,res)=>{
  const id=int(req.params.id);
  if(!id)return error(res,400,'Invalid account');
  if(id===req.user.id)return error(res,403,'You cannot delete your own account');
  const client=await db.getConnection();
  try{
    await client.beginTransaction();
    const [found]=await client.query('SELECT id,role FROM users WHERE id=? FOR UPDATE',[id]);
    if(!found.length){await client.rollback();return error(res,404,'Account not found')}
    if(found[0].role==='admin'){await client.rollback();return error(res,403,'Administrator accounts cannot be deleted')}
    const [usage]=await client.query(`SELECT
      (SELECT COUNT(*) FROM courses WHERE instructor_id=?) AS courses,
      (SELECT COUNT(*) FROM enrollments WHERE user_id=?) AS enrollments,
      (SELECT COUNT(*) FROM lesson_progress WHERE user_id=?) AS progress,
      (SELECT COUNT(*) FROM quiz_attempts WHERE user_id=?) AS attempts`,[id,id,id,id]);
    if(Object.values(usage[0]).some(Number)){
      await client.rollback();
      return error(res,409,'This account has courses or learning records. Deactivate it instead to preserve school data.');
    }
    await client.query('DELETE FROM users WHERE id=?',[id]);
    await client.commit();res.json({message:'Unused account permanently deleted'});
  }catch(e){await client.rollback();throw e}finally{client.release()}
}));
app.use((req,res)=>error(res,404,'Endpoint not found'));
app.use((err,req,res,next)=>{console.error(err);if(err.code==='42P01'||err.code==='3D000')return error(res,503,'Database not initialized; run server/sql/skilltrack_postgres.sql in Neon SQL Editor');error(res,500,'An unexpected server error occurred')});
export default app;
if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  const port=Number(process.env.PORT||5000);
  app.listen(port,()=>console.log(`SKILLTRACK API on http://localhost:${port}`));
}

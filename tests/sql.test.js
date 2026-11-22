import test from 'node:test';
import assert from 'node:assert/strict';
import {toPostgres} from '../server/src/db.js';
test('MySQL placeholders become PG placeholders',()=>assert.equal(toPostgres('SELECT * FROM users WHERE id=? AND email=?'),'SELECT * FROM users WHERE id=$1 AND email=$2'));
test('boolean SQL is migrated',()=>{assert.match(toPostgres('SELECT * FROM courses WHERE published=1'), /published = TRUE/);assert.match(toPostgres('INSERT INTO courses(instructor_id,title,description,category,level,published) VALUES(?,?,?,?,?,0)'),/FALSE/)});
test('student string literal conversion',()=>assert.match(toPostgres('VALUES (?, ?, ?, "student")'),/\'student\'/));

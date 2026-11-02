import 'reflect-metadata';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { ProtectedRoute } from '../client/src/components/ProtectedRoute';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { WeeklyBPlusService } from '../server/modules/weekly-b-plus/weekly-b-plus.service';
import { CommitmentsController } from '../server/modules/commitments/commitments.controller';
import { RatingsController } from '../server/modules/ratings/ratings.controller';
import { GradingService } from '../server/modules/grading/grading.service';
import { RosterController } from '../server/modules/roster/roster.controller';
import { canGradeRecord, canViewPersonalRating } from '../shared/permissions';
async function main(){
let cases=0;
const owner={userId:'owner',level:'member',module:'软件组',canGrade:true};
const actors=[
 [{userId:'owner',level:'member',module:'软件组',canGrade:true},true,false],
 [{userId:'peer',level:'member',module:'软件组',canGrade:true},false,false],
 [{userId:'l1',level:'L1',canGrade:false},true,true],
 [{userId:'l2',level:'L2',managedModules:['软件组'],canGrade:true},true,true],
 [{userId:'l2off',level:'L2',managedModules:['软件组'],canGrade:false},false,false],
 [{userId:'l3',level:'L3',module:'软件组',canGrade:true},true,true],
 [{userId:'l3off',level:'L3',module:'软件组',canGrade:false},false,false],
 [{userId:'other',level:'L3',module:'净水模块',canGrade:true},false,false],
 [{userId:'l4',level:'L4',module:'软件组',canGrade:true},false,false],
 [{userId:'absent',level:'member'},false,false],
] as const;
const item={id:'c',week:'W35',module:'软件组',ownerUserId:'owner',deliverable:'everyone can read',weekendGrade:'A',weekendNote:'private',mondayGrade:'B+',mondayNote:'private again'};
for(const [actor,view,grade] of actors){
 assert.equal(canViewPersonalRating(actor as any,owner as any,'软件组'),view);assert.equal(canGradeRecord(actor as any,owner as any,'软件组'),grade);
 const roster:any={scopeHolderForUser:async(id:string)=>id===actor.userId?actor:owner,scopeHolderMapForUsers:async(ids:string[])=>new Map(ids.map(id=>[id,id===actor.userId?actor:owner])),listRoster:async()=>[owner],getModuleForUser:async()=> '软件组'};
 const controller=new CommitmentsController({listByModuleWeek:async()=>[item],update:async()=>item} as any,roster);
 const req:any={userContext:{userId:actor.userId}};
 const res=await controller.list(req,'软件组','', 'W35');assert.equal(res.items[0].deliverable,item.deliverable);assert.equal(res.items[0].canViewRating,view);assert.equal(res.items[0].canGradeRating,grade);assert.equal(res.items[0].weekendNote,view?'private':undefined);assert.equal(res.items[0].mondayGrade,view?'B+':undefined);
 const updated=await controller.update(req,'c',{});assert.equal(updated.record.weekendGrade,view?'A':undefined);
 const ratings=new RatingsController({listByWeek:async()=>[{...item,memberUserId:'owner'}],listModuleRatings:async()=>[{module:'软件组',weekendGrade:'A'}]} as any,roster);
 assert.equal((await ratings.list(req,'W35')).items.length,view?1:0);assert.equal((await ratings.listModule()).items.length,1);
 if(actor.level!=='L1'){const org=new RosterController(roster);await assert.rejects(()=>org.removeMember(req,'owner'),/仅限 L1/)}
 const grader=new GradingService({} as any,{getById:async()=>item,listByModuleWeek:async()=>[{...item,checked:'✅'}]} as any,{listForMember:async()=>[],applyPersonGrade:async()=>undefined} as any,roster);
 if(grade) await grader.gradeCommitment('软件组','c','weekend','A','note',actor as any);
 else await assert.rejects(()=>grader.gradeCommitment('软件组','c','weekend','A','note',actor as any),/forbidden/);
 const gate=React.createElement(MemoryRouter,null,React.createElement(Routes,null,
   React.createElement(Route,{element:React.createElement(Outlet,{context:{me:actor}})},
     React.createElement(Route,{index:true,element:React.createElement(ProtectedRoute,{requiredRoles:['admin'],children:React.createElement('span',null,'ADMIN_ONLY')})}))));
 assert.equal(renderToString(gate).includes('ADMIN_ONLY'),actor.level==='L1');
 cases+=10;
}
const pg=new PGlite();await pg.exec(`CREATE TYPE user_profile AS (user_id text); CREATE TABLE weekly_b_plus(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),week varchar NOT NULL,owner_profile user_profile NOT NULL,name text,criteria text,edit_authorized boolean DEFAULT false,edit_reason text,_created_at timestamptz DEFAULT now(),_updated_at timestamptz DEFAULT now(),_created_by user_profile,_updated_by user_profile); CREATE UNIQUE INDEX uk_bplus ON weekly_b_plus(week,((owner_profile).user_id));`);
const svc=new WeeklyBPlusService(drizzle(pg) as any,{getNameForUser:async()=> 'Test'} as any,{currentWeekLabel:async()=> 'W35'} as any,{hasGrade:async()=> false} as any);
await svc.save('owner','W35','first standard');await assert.rejects(()=>svc.save('owner','W35',''),/锁定/);await assert.rejects(()=>svc.save('owner','W35','changed'),/锁定/);assert.equal((await svc.save('owner','W35','first standard'))?.criteria,'first standard');await assert.rejects(()=>svc.save('owner','W34','old'),/past_week_locked/);
const concurrent=await Promise.allSettled([svc.save('race','W35','one'),svc.save('race','W35','two')]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.equal((await svc.listByWeek('W35')).length,2);cases+=7;await pg.close();console.log('PASS '+cases+' assertions; isolated database only');
}
main().catch(e=>{console.error(e);process.exit(1)});

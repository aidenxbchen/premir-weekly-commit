ALTER TABLE roster_snapshot ADD COLUMN IF NOT EXISTS level varchar(10);
COMMENT ON COLUMN roster_snapshot.level IS '组织快照中的业务管理层级：L1/L2/L3/member';

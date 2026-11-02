import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { MilestonesService } from '../milestones/milestones.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { RatingsService } from '../ratings/ratings.service';
import { RosterService } from '../roster/roster.service';
import { canGradeModule, canGradeRecord } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import { isChecklistComplete } from '@server/common/utils/criteria.util';
import type {
  CommitmentRecord,
  Grade,
  GradeWhich,
  MilestoneRecord,
  ModuleName,
} from '@shared/api.interface';

const VALID_GRADES: Grade[] = ['A', 'B+', 'B', 'C'];

@Injectable()
export class GradingService {
  constructor(
    private readonly milestonesService: MilestonesService,
    private readonly commitmentsService: CommitmentsService,
    private readonly ratingsService: RatingsService,
    private readonly rosterService: RosterService,
  ) {}

  async gradeMilestone(
    id: string,
    which: GradeWhich,
    grade: Grade,
    note: string,
    actor: ScopeHolder,
    correctionReason?: string,
  ): Promise<MilestoneRecord> {
    if (!VALID_GRADES.includes(grade)) throw new BadRequestException('invalid_grade');
    const existing: MilestoneRecord | undefined = await this.milestonesService.getById(id);
    if (!existing) throw new NotFoundException('not_found');

    // 里程碑是"模块自己的"评级，评的是部门不是人，所以只看半径、没有"不评自己"；
    // L4 组内协调人例外——它能写里程碑内容，但不能评。
    if (!canGradeModule(actor, existing.module)) throw new ForbiddenException('forbidden');

    const bDone: boolean = isChecklistComplete(existing.bCriteria, existing.bCheck);
    const bPlusDone: boolean = isChecklistComplete(existing.bPlusCriteria, existing.bPlusCheck);
    if (!bDone || !bPlusDone) throw new HttpException('checklist_incomplete', 423);
    if (which === 'monday' && !existing.weekendGrade) {
      throw new HttpException('weekend_not_graded_yet', 423);
    }

    await this.ratingsService.applyModuleGrade(id, existing.module, existing.week, which, grade, note, actor.userId, correctionReason);
    return (await this.milestonesService.getById(id))!;
  }

  async gradeCommitment(
    module: ModuleName,
    id: string,
    which: GradeWhich,
    grade: Grade,
    note: string,
    actor: ScopeHolder,
    correctionReason?: string,
  ): Promise<CommitmentRecord> {
    if (!VALID_GRADES.includes(grade)) throw new BadRequestException('invalid_grade');
    const existing: CommitmentRecord | undefined = await this.commitmentsService.getById(id);
    if (!existing) throw new NotFoundException('not_found');
    // 权限判断和后续写入一律用这条交付物真实所属的模块，不用调用方传入的 URL
    // 参数 module——两者理论上应该一致（前端总是从同一个模块页面取 id 和
    // module），但权限检查不该建立在"调用方传值恰好没错"这个假设上，尤其是
    // 协调人可能跨模块操作，传错模块会导致查错 coordinatingModules 归属。
    if (existing.module !== module) throw new BadRequestException('module_mismatch');

    // 统一判定：半径内 + 不评自己 + 下级不评上级。半径按这条承诺所属的模块算，
    // 级别按所有者的现行级别算（见 canManageRecord 的说明）。
    const owner: ScopeHolder = await this.rosterService.scopeHolderForUser(existing.ownerUserId);
    if (!canGradeRecord(actor, owner, existing.module as ModuleName)) throw new ForbiddenException('forbidden');

    const siblings: CommitmentRecord[] = await this.commitmentsService.listByModuleWeek(module, existing.week);
    const ownerDeliverables: CommitmentRecord[] = siblings.filter((c: CommitmentRecord) => c.ownerUserId === existing.ownerUserId);
    const allChecked: boolean =
      ownerDeliverables.length > 0 && ownerDeliverables.every((c: CommitmentRecord) => c.checked === '✅' || c.checked === '❌' || c.checked === '⏹️');
    if (!allChecked) throw new HttpException('checklist_incomplete', 423);
    const personRating = (await this.ratingsService.listForMember(existing.ownerUserId)).find((item) => item.week === existing.week);
    if (which === 'monday' && !personRating?.weekendGrade) {
      throw new HttpException('weekend_not_graded_yet', 423);
    }

    await this.ratingsService.applyPersonGrade(
      existing.ownerUserId,
      module,
      existing.week,
      which,
      grade,
      note,
      actor.userId,
      correctionReason,
    );
    return (await this.commitmentsService.getById(id))!;
  }
}

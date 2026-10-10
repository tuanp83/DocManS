export class CreateStudentProjectDto {
  code: string;
  name: string;
  studentName: string;
  studentClass: string;
  studentContact?: string;
  supervisorId: string;
  startDate?: string;
  endDate?: string;
}

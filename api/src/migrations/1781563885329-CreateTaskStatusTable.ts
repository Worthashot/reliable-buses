import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTaskStatusTable1781563885329 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS task_status (
            task_name TEXT PRIMARY KEY,
            status INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS task_status`);
    }

}

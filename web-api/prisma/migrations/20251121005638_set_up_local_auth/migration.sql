/*
  Warnings:

  - You are about to drop the column `workosId` on the `User` table. All the data in the column will be lost.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "User_workosId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "workosId",
ADD COLUMN     "passwordHash" TEXT NOT NULL;

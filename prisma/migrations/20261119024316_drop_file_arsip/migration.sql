/*
  Warnings:

  - You are about to drop the column `file_name` on the `arsip` table. All the data in the column will be lost.
  - You are about to drop the column `file_path` on the `arsip` table. All the data in the column will be lost.
  - You are about to drop the column `file_size` on the `arsip` table. All the data in the column will be lost.
  - You are about to drop the column `mime_type` on the `arsip` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "arsip" DROP COLUMN "file_name",
DROP COLUMN "file_path",
DROP COLUMN "file_size",
DROP COLUMN "mime_type";

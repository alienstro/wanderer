-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "memory" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "memory_through_position" INTEGER;

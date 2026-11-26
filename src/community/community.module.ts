import { Module } from '@nestjs/common';
import { CommunityService } from './community.service.js';
import { PhotoStorage } from './photo-storage.js';
import { PostsController } from './posts.controller.js';

@Module({
  controllers: [PostsController],
  providers: [CommunityService, PhotoStorage],
})
export class CommunityModule {}

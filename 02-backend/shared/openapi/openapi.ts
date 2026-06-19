// Hand-authored OpenAPI 3.1 specification for the 3D Interior Design Editor API.
// Covers all 32 endpoints from the API Surface Table (BACKEND_PLAN.md §6).

const spec = {
  openapi: '3.1.0',
  info: {
    title: '3D Interior Design Editor API',
    version: '1.0.0',
    description: 'REST API for the 3D Interior Design Editor. All endpoints (except /health, /docs/openapi.json, /share/:token) require Bearer JWT authentication.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Supabase JWT (HS256). Pass as Authorization: Bearer <token>.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: {} },
            },
            required: ['code', 'message'],
          },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          displayName: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          plan: { type: 'string', enum: ['free', 'pro', 'team', 'enterprise'] },
          storageUsed: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectMeta: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ownerId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          thumbnailUrl: { type: 'string', nullable: true },
          floorCount: { type: 'integer' },
          isTemplate: { type: 'boolean' },
          isPublic: { type: 'boolean' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      LibraryObject: {
        type: 'object',
        description: 'Slug-keyed catalog object (Decision A). `id` is the catalog slug.',
        properties: {
          id: { type: 'string', description: 'catalog slug, e.g. bath-01' },
          name: { type: 'string' },
          category: { type: 'string', description: 'category slug, e.g. bathroom' },
          modelUrl: { type: 'string' },
          thumbnailUrl: { type: 'string', nullable: true },
          topdownUrl: { type: 'string', nullable: true },
          boundingBox: { type: 'object', description: '{ width, depth, height }' },
          collisionBox: { type: 'object', description: '{ width, depth }' },
          materialSlots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                allowedCategories: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          materialBindings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                meshName: { type: 'string' },
                materialName: { type: 'string' },
                slotId: { type: 'string' },
              },
            },
          },
          isPremium: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
      },
      Material: {
        type: 'object',
        description: 'Slug-keyed material (Decision A). `id` is the catalog slug.',
        properties: {
          id: { type: 'string', description: 'catalog slug, e.g. Asphalt031' },
          name: { type: 'string' },
          category: { type: 'string', description: 'category slug, e.g. ground' },
          iconUrl: { type: 'string', nullable: true },
          textures: {
            type: 'object',
            description: 'resolved KTX2 texture URLs',
            properties: {
              color: { type: 'string' },
              normal: { type: 'string' },
              roughness: { type: 'string' },
              ao: { type: 'string' },
            },
          },
          isPremium: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
      },
      Share: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          sharedWith: { type: 'string', format: 'uuid', nullable: true },
          permission: { type: 'string', enum: ['viewer', 'commenter', 'editor'] },
          token: { type: 'string', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdBy: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      VersionSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          versionNum: { type: 'integer' },
          label: { type: 'string', nullable: true },
          createdBy: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        security: [],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string' } } } } } },
        },
      },
    },
    '/docs/openapi.json': {
      get: {
        summary: 'OpenAPI specification',
        security: [],
        responses: { '200': { description: 'OpenAPI 3.1 document' } },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a new user account',
        security: [],
        description: 'Creates a Supabase Auth user and pre-seeds the public.profiles row. The account is immediately active (email_confirm: true). After registration, sign in via Supabase client signInWithPassword.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: {
                    type: 'string',
                    minLength: 8,
                    description: 'Min 8 chars, at least one uppercase letter, one digit, one special character.',
                    example: 'Sup3r$ecret',
                  },
                  displayName: { type: 'string', maxLength: 120, example: 'Nguyễn Văn A' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    email: { type: 'string', format: 'email' },
                    displayName: { type: 'string', nullable: true },
                  },
                  required: ['id', 'email', 'displayName'],
                },
              },
            },
          },
          '400': { description: 'Validation error (invalid email / weak password)', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          '409': { description: 'Email already registered', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          '422': { description: 'Validation error (Zod schema rejection)', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          '502': { description: 'Supabase upstream error', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get authenticated user profile',
        responses: {
          '200': { description: 'User profile', content: { 'application/json': { schema: { '$ref': '#/components/schemas/UserProfile' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/me/profile': {
      patch: {
        summary: 'Update user profile',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { displayName: { type: 'string' }, avatarUrl: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Updated profile', content: { 'application/json': { schema: { '$ref': '#/components/schemas/UserProfile' } } } },
          '422': { description: 'Validation error', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
        },
      },
    },
    '/projects': {
      get: {
        summary: 'List projects (cursor-paginated)',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['updatedAt', 'createdAt', 'name'] } },
        ],
        responses: { '200': { description: 'Paginated project list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/ProjectMeta' } }, nextCursor: { type: 'string', nullable: true } } } } } } },
      },
      post: {
        summary: 'Create project',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, floorCount: { type: 'integer' } } } } } },
        responses: { '201': { description: 'Created project', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ProjectMeta' } } } } },
      },
    },
    '/projects/{id}': {
      get: {
        summary: 'Get project metadata',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Project metadata', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ProjectMeta' } } } }, '404': { description: 'Not found' } },
      },
      patch: {
        summary: 'Update project metadata (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, thumbnailUrl: { type: 'string' }, isTemplate: { type: 'boolean' }, isPublic: { type: 'boolean' } } } } } },
        responses: { '200': { description: 'Updated project', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ProjectMeta' } } } } },
      },
      delete: {
        summary: 'Soft-delete project (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/projects/{id}/restore': {
      post: {
        summary: 'Restore soft-deleted project (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Restored project', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ProjectMeta' } } } } },
      },
    },
    '/projects/{id}/duplicate': {
      post: {
        summary: 'Duplicate project (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '201': { description: 'New project id and name', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } } } } },
      },
    },
    '/projects/{id}/scene': {
      get: {
        summary: 'Load full scene (owner or share)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'shareToken', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Scene data blob (slug refs preserved)', content: { 'application/json': { schema: { type: 'object', properties: { sceneData: { type: 'object' } } } } } } },
      },
      put: {
        summary: 'Save full scene (owner or editor share)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { sceneData: { type: 'object', required: ['version'], properties: { version: { type: 'number' } } } }, required: ['sceneData'] } } } },
        responses: { '200': { description: 'Saved timestamp', content: { 'application/json': { schema: { type: 'object', properties: { savedAt: { type: 'string', format: 'date-time' } } } } } } },
      },
    },
    '/projects/{id}/autosave': {
      post: {
        summary: 'Create autosave (owner or editor share)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { sceneData: { type: 'object' }, clientId: { type: 'string' } }, required: ['sceneData'] } } } },
        responses: { '201': { description: 'Autosave id and timestamp', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, savedAt: { type: 'string', format: 'date-time' } } } } } } },
      },
    },
    '/projects/{id}/autosave/latest': {
      get: {
        summary: 'Get latest autosave',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Latest autosave', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, sceneData: { type: 'object' }, savedAt: { type: 'string', format: 'date-time' }, clientId: { type: 'string', nullable: true } } } } } }, '404': { description: 'No autosave found' } },
      },
    },
    '/projects/{id}/versions': {
      get: {
        summary: 'List versions (newest first)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Version list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/VersionSummary' } } } } } } } },
      },
      post: {
        summary: 'Create version snapshot (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { label: { type: 'string', maxLength: 200 } } } } } },
        responses: { '201': { description: 'Created version', content: { 'application/json': { schema: { '$ref': '#/components/schemas/VersionSummary' } } } } },
      },
    },
    '/projects/{id}/versions/{vid}': {
      get: {
        summary: 'Get version with full scene_data',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'vid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Version detail with sceneData' } },
      },
    },
    '/projects/{id}/versions/{vid}/restore': {
      post: {
        summary: 'Restore project to version (owner only)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'vid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Restore timestamp', content: { 'application/json': { schema: { type: 'object', properties: { restoredAt: { type: 'string', format: 'date-time' } } } } } } },
      },
    },
    '/library/categories': {
      get: {
        summary: 'Distinct category slugs in use (cached 5min)',
        responses: { '200': { description: 'Category slug list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } } } } } } },
      },
    },
    '/library/objects': {
      get: {
        summary: 'List library objects (cursor-paginated)',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', description: 'category slug' } },
          { name: 'isPremium', in: 'query', schema: { type: 'boolean' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: { '200': { description: 'Paginated library objects', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/LibraryObject' } }, nextCursor: { type: 'string', nullable: true } } } } } } },
      },
    },
    '/library/objects/search': {
      get: {
        summary: 'Full-text + trigram search (max 20 results)',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } },
          { name: 'category', in: 'query', schema: { type: 'string', description: 'category slug' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Search results', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/LibraryObject' } } } } } } } },
      },
    },
    '/library/objects/{slug}': {
      get: {
        summary: 'Get library object detail by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Library object detail', content: { 'application/json': { schema: { '$ref': '#/components/schemas/LibraryObject' } } } }, '404': { description: 'Not found' } },
      },
    },
    '/materials': {
      get: {
        summary: 'List materials (cursor-paginated)',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', description: 'category slug' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: 'Paginated materials', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Material' } }, nextCursor: { type: 'string', nullable: true } } } } } } },
      },
    },
    '/materials/search': {
      get: {
        summary: 'Full-text + trigram material search',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } },
          { name: 'category', in: 'query', schema: { type: 'string', description: 'category slug' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Search results', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Material' } } } } } } } },
      },
    },
    '/materials/{slug}': {
      get: {
        summary: 'Get material detail with resolved texture URLs',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Material detail', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Material' } } } }, '404': { description: 'Not found' } },
      },
    },
    '/projects/{id}/share': {
      get: {
        summary: 'List shares for project (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Share list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Share' } } } } } } } },
      },
      post: {
        summary: 'Create share (owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { sharedWith: { type: 'string', format: 'uuid' }, permission: { type: 'string', enum: ['viewer', 'commenter', 'editor'] }, expiresAt: { type: 'string', format: 'date-time' } }, required: ['permission'] } } } },
        responses: { '201': { description: 'Created share', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Share' } } } } },
      },
    },
    '/projects/{id}/share/{shareId}': {
      patch: {
        summary: 'Update share permission or expiry (owner only)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'shareId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { permission: { type: 'string', enum: ['viewer', 'commenter', 'editor'] }, expiresAt: { type: 'string', format: 'date-time', nullable: true } } } } } },
        responses: { '200': { description: 'Updated share', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Share' } } } } },
      },
      delete: {
        summary: 'Revoke share (owner only)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'shareId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '204': { description: 'Revoked' } },
      },
    },
    '/share/{token}': {
      get: {
        summary: 'Resolve share token — public, no auth required',
        security: [],
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Project metadata and permission', content: { 'application/json': { schema: { type: 'object', properties: { projectMeta: { '$ref': '#/components/schemas/ProjectMeta' }, permission: { type: 'string', enum: ['viewer', 'commenter', 'editor'] } } } } } },
          '403': { description: 'Invalid or expired token' },
        },
      },
    },
  },
};

export function getOpenApiSpec(): typeof spec {
  return spec;
}

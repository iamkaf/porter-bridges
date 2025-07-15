import { Command } from 'commander';
import { logger } from './utils/logger';
import { OrchestrationCommand } from './cli/OrchestrationCommand';
import { executeDiscoveryCommand } from './cli/DiscoveryCommand';
import { executeCollectionCommand } from './cli/CollectionCommand';
import { executeDistillationCommand } from './cli/DistillationCommand';
import { executePackageCommand } from './cli/PackageCommand';
import { executeBundleCommand } from './cli/BundleCommand';

const program = new Command();

program
  .name('linkie-porting-intelligence')
  .description(
    'A development utility for discovering, processing, and packaging Minecraft mod porting data.'
  )
  .version('1.0.0');

// Interactive orchestration command - THE MAIN FEATURE
program
  .command('orchestrate')
  .alias('run')
  .description('🎬 Interactive pipeline execution with beautiful step-by-step prompts')
  .option('--cache-dir <path>', 'Cache directory for discovery data', './.discovery-cache')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--max-concurrent <num>', 'Maximum concurrent operations', '3')
  .option('--gemini-model <model>', 'Gemini model to use', 'gemini-2.5-flash')
  .option('--bundle-name <name>', 'Bundle name prefix', 'linkie-porting-intelligence')
  .option('--version <version>', 'Package version (auto-generated if not specified)')
  .option('--skip-discovery', 'Skip the discovery phase and use existing data')
  .option('--skip-collection', 'Skip the collection phase and use existing data')
  .option('--skip-distillation', 'Skip the distillation phase and use existing data')
  .action(async (options) => {
    const orchestration = new OrchestrationCommand();
    await orchestration.execute(options);
  });

// Individual command components (for advanced users)
program
  .command('discover')
  .description('Discover new versions of Minecraft, mod loaders, and other relevant tools.')
  .option(
    '-o, --output <path>',
    'Output file for discovered sources',
    './generated/discovered-sources.json'
  )
  .option('--cache-dir <path>', 'Cache directory for discovery data', './.discovery-cache')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--filter-type <type>', 'Filter by source type (primer, blog_post, changelog)')
  .option('--filter-loader <loader>', 'Filter by loader type (fabric, forge, neoforge)')
  .option('--min-relevance <score>', 'Minimum relevance score (0-1)', '0.3')
  .action(executeDiscoveryCommand);

program
  .command('collect')
  .description('Collect raw content from discovered sources.')
  .option(
    '-i, --input <path>',
    'Input file with discovered sources',
    './generated/discovered-sources.json'
  )
  .option(
    '-o, --output <path>',
    'Output file for collected sources',
    './generated/collected-sources.json'
  )
  .option(
    '--content-dir <path>',
    'Directory to save downloaded content',
    './generated/collected-content'
  )
  .option('--max-concurrent <num>', 'Maximum concurrent downloads', '5')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--filter-type <type>', 'Filter by source type (primer, blog_post, changelog)')
  .option('--filter-loader <loader>', 'Filter by loader type (fabric, forge, neoforge, vanilla)')
  .option('--filter-priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('--min-relevance <score>', 'Minimum relevance score (0-1)', '0.3')
  .option('--include-retry', 'Include failed sources for retry')
  .option('--resume', 'Resume from previous collection state')
  .action(executeCollectionCommand);

program
  .command('distill')
  .description('Process and transform raw data into a structured format using AI.')
  .option(
    '-i, --input <path>',
    'Input file with collected sources',
    './generated/collected-sources.json'
  )
  .option(
    '-o, --output <path>',
    'Output file for distilled sources',
    './generated/distilled-sources.json'
  )
  .option(
    '--content-dir <path>',
    'Directory containing collected content',
    './generated/collected-content'
  )
  .option(
    '--output-dir <path>',
    'Directory to save distilled content',
    './generated/distilled-content'
  )
  .option('--gemini-model <model>', 'Gemini model to use', 'gemini-2.5-flash')
  .option('--max-concurrent <num>', 'Maximum concurrent distillations', '1')
  .option('--timeout <ms>', 'Processing timeout in milliseconds', '600000')
  .option('--filter-type <type>', 'Filter by source type (primer, blog_post, changelog)')
  .option('--filter-loader <loader>', 'Filter by loader type (fabric, forge, neoforge, vanilla)')
  .option('--filter-priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('--min-relevance <score>', 'Minimum relevance score (0-1)', '0.3')
  .option('--include-retry', 'Include failed sources for retry')
  .option('--resume', 'Resume from previous distillation state')
  .action(executeDistillationCommand);

program
  .command('package')
  .description('Create a versioned data package from distilled content.')
  .option(
    '-i, --input <path>',
    'Input file with distilled sources',
    './generated/distilled-sources.json'
  )
  .option(
    '-o, --output <path>',
    'Output file for package metadata',
    './generated/package-results.json'
  )
  .option('--package-dir <path>', 'Directory to save packaged content', './generated/packages')
  .option(
    '--distilled-dir <path>',
    'Directory containing distilled content',
    './generated/distilled-content'
  )
  .option('--pkg-version <version>', 'Package version (auto-generated if not specified)')
  .option('--no-metadata', 'Skip package metadata generation')
  .option('--no-checksums', 'Skip integrity checksum generation')
  .action(executePackageCommand);

program
  .command('bundle')
  .description('Bundle packaged content into distributable archives.')
  .option(
    '-o, --output <path>',
    'Output file for bundle metadata',
    './generated/bundle-results.json'
  )
  .option('--bundle-dir <path>', 'Directory to save bundled content', './generated/bundles')
  .option('--package-dir <path>', 'Directory containing packages', './generated/packages')
  .option('--bundle-name <name>', 'Bundle name prefix', 'linkie-porting-intelligence')
  .option('--no-metadata', 'Skip bundle metadata generation')
  .option('--no-checksums', 'Skip integrity checksum generation')
  .option('--no-archive', 'Skip distribution archive creation')
  .action(executeBundleCommand);

// Setup graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

program.parse(process.argv);

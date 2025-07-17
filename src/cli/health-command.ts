/**
 * @file Health Command - CLI command for system health checks
 *
 * This command provides comprehensive health checking capabilities
 * for monitoring system components and overall health status.
 */

import { Command } from 'commander';
import { healthCheckCommand, globalHealthManager } from '../utils/health-checks';
import { globalCircuitBreakerRegistry } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

/**
 * Create health check command
 */
export function createHealthCommand(): Command {
  const command = new Command('health')
    .description('Check system health and component status')
    .option('-c, --component <name>', 'Check specific component health')
    .option('-j, --json', 'Output in JSON format')
    .option('-w, --watch', 'Watch mode - continuously monitor health')
    .option('-i, --interval <seconds>', 'Watch interval in seconds', '30')
    .option('--reset-breakers', 'Reset all circuit breakers')
    .option('--simple', 'Simple health check for monitoring')
    .action(async (options) => {
      try {
        // Reset circuit breakers if requested
        if (options.resetBreakers) {
          globalCircuitBreakerRegistry.resetAll();
          console.log('✅ All circuit breakers reset');
          return;
        }

        // Simple health check
        if (options.simple) {
          const healthStatus = await globalHealthManager.getHealthStatus();
          
          if (options.json) {
            console.log(JSON.stringify(healthStatus, null, 2));
          } else {
            console.log(`Status: ${healthStatus.status}`);
            console.log(`Message: ${healthStatus.message}`);
            console.log(`Uptime: ${Math.floor(healthStatus.uptime / 1000)}s`);
          }
          
          process.exit(healthStatus.status === 'healthy' ? 0 : 1);
        }

        // Component-specific health check
        if (options.component) {
          const result = await globalHealthManager.getComponentHealth(options.component);
          
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const emoji = result.healthy ? '✅' : '❌';
            console.log(`${emoji} ${result.component}: ${result.message}`);
            console.log(`Response time: ${result.responseTime}ms`);
            console.log(`Timestamp: ${result.timestamp}`);
            
            if (result.details) {
              console.log('Details:', JSON.stringify(result.details, null, 2));
            }
          }
          
          process.exit(result.healthy ? 0 : 1);
        }

        // Watch mode
        if (options.watch) {
          const interval = parseInt(options.interval) * 1000;
          
          console.log(`🔍 Health monitoring started (interval: ${options.interval}s)`);
          console.log('Press Ctrl+C to stop\n');
          
          let iteration = 0;
          
          const checkHealth = async () => {
            iteration++;
            const timestamp = new Date().toISOString();
            
            try {
              if (options.json) {
                const systemHealth = await globalHealthManager.getSystemHealth();
                console.log(`--- Health Check ${iteration} (${timestamp}) ---`);
                console.log(JSON.stringify(systemHealth, null, 2));
              } else {
                const healthStatus = await globalHealthManager.getHealthStatus();
                const statusEmoji = healthStatus.status === 'healthy' ? '✅' : 
                                   healthStatus.status === 'degraded' ? '⚠️' : '❌';
                
                console.log(`[${timestamp}] ${statusEmoji} ${healthStatus.status.toUpperCase()}: ${healthStatus.message}`);
              }
            } catch (error) {
              console.error(`[${timestamp}] ❌ Health check failed:`, error instanceof Error ? error.message : String(error));
            }
          };
          
          // Initial check
          await checkHealth();
          
          // Set up interval
          const intervalId = setInterval(checkHealth, interval);
          
          // Handle graceful shutdown
          process.on('SIGINT', () => {
            console.log('\n🛑 Stopping health monitoring...');
            clearInterval(intervalId);
            process.exit(0);
          });
          
          return;
        }

        // Full health check (default)
        if (options.json) {
          const systemHealth = await globalHealthManager.getSystemHealth();
          console.log(JSON.stringify(systemHealth, null, 2));
          process.exit(systemHealth.healthy ? 0 : 1);
        } else {
          await healthCheckCommand();
        }
      } catch (error) {
        logger.error('Health command failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        console.error('❌ Health command failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

export default createHealthCommand;
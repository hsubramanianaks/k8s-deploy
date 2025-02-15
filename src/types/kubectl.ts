import {ExecOutput, getExecOutput} from '@actions/exec'
import {createInlineArray} from '../utilities/arrayUtils'
import * as core from '@actions/core'
import * as toolCache from '@actions/tool-cache'
import * as io from '@actions/io'

export interface Resource {
   name: string
   type: string
}

export class Kubectl {
   private readonly kubectlPath: string
   private readonly namespace: string
   private readonly ignoreSSLErrors: boolean

   constructor(
      kubectlPath: string,
      namespace: string = 'default',
      ignoreSSLErrors: boolean = false
   ) {
      this.kubectlPath = kubectlPath
      this.ignoreSSLErrors = !!ignoreSSLErrors
      this.namespace = namespace
   }

   public async apply(
      configurationPaths: string | string[],
      force: boolean = false
   ): Promise<ExecOutput> {
      try {
         if (!configurationPaths || configurationPaths?.length === 0)
            throw Error('Configuration paths must exist')

         const applyArgs: string[] = [
            'apply',
            '-f',
            createInlineArray(configurationPaths)
         ]
         if (force) applyArgs.push('--force')

         return await this.execute(applyArgs)
      } catch (err) {
         core.debug('Kubectl apply failed:' + err)
      }
   }

   public async describe(
      resourceType: string,
      resourceName: string,
      silent: boolean = false
   ): Promise<ExecOutput> {
      return await this.execute(
         ['describe', resourceType, resourceName],
         silent
      )
   }

   public async getNewReplicaSet(deployment: string) {
      const result = await this.describe('deployment', deployment, true)

      let newReplicaSet = ''
      if (result?.stdout) {
         const stdout = result.stdout.split('\n')
         stdout.forEach((line: string) => {
            const newreplicaset = 'newreplicaset'
            if (line && line.toLowerCase().indexOf(newreplicaset) > -1)
               newReplicaSet = line
                  .substring(newreplicaset.length)
                  .trim()
                  .split(' ')[0]
         })
      }

      return newReplicaSet
   }

   public async annotate(
      resourceType: string,
      resourceName: string,
      annotation: string
   ): Promise<ExecOutput> {
      const args = [
         'annotate',
         resourceType,
         resourceName,
         annotation,
         '--overwrite'
      ]
      return await this.execute(args)
   }

   public async annotateFiles(
      files: string | string[],
      annotation: string
   ): Promise<ExecOutput> {
      const args = [
         'annotate',
         '-f',
         createInlineArray(files),
         annotation,
         '--overwrite'
      ]
      return await this.execute(args)
   }

   public async labelFiles(
      files: string | string[],
      labels: string[]
   ): Promise<ExecOutput> {
      const args = [
         'label',
         '-f',
         createInlineArray(files),
         ...labels,
         '--overwrite'
      ]
      return await this.execute(args)
   }

   public async getAllPods(): Promise<ExecOutput> {
      return await this.execute(['get', 'pods', '-o', 'json'], true)
   }

   public async checkRolloutStatus(
      resourceType: string,
      name: string
   ): Promise<ExecOutput> {
      return await this.execute([
         'rollout',
         'status',
         `${resourceType}/${name}`
      ])
   }

   public async getResource(
      resourceType: string,
      name: string
   ): Promise<ExecOutput> {
      return await this.execute([
         'get',
         `${resourceType}/${name}`,
         '-o',
         'json'
      ])
   }

   public executeCommand(command: string, args?: string) {
      if (!command) throw new Error('Command must be defined')
      return args ? this.execute([command, args]) : this.execute([command])
   }

   public delete(args: string | string[]) {
      if (typeof args === 'string') return this.execute(['delete', args])
      return this.execute(['delete', ...args])
   }

   private async execute(args: string[], silent: boolean = false) {
      if (this.ignoreSSLErrors) {
         args.push('--insecure-skip-tls-verify')
      }
      if (this.namespace && this.namespace != 'default') {
         args = args.concat(['--namespace', this.namespace])
      }
      core.debug(`Kubectl run with command: ${this.kubectlPath} ${args}`)
      return await getExecOutput(this.kubectlPath, args, {silent})
   }
}

export async function getKubectlPath() {
   const version = core.getInput('kubectl-version')
   const kubectlPath = version
      ? toolCache.find('kubectl', version)
      : await io.which('kubectl', true)
   if (!kubectlPath)
      throw Error(
         'kubectl not found. You must install it before running this action'
      )

   return kubectlPath
}

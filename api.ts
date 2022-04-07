import puppeteer, { JSONObject } from 'puppeteer-core'
import { Launcher } from 'chrome-launcher';
import { banner } from './banner';

declare global {
  interface Window {
    vm: any
  }
  namespace NodeJS {
    interface ProcessEnv {
      CI: boolean
    }
  }
}


export async function runZjuHealthReport(username?: string, password?: string) {
  if (!username) {
    throw new Error('请配置环境变量 username，详情请阅读项目 README.md: https://github.com/zju-health-report/action')
  }
  if (!password) {
    throw new Error('请配置环境变量 password，详情请阅读项目 README.md: https://github.com/zju-health-report/action')
  }

  const dev = process.env.NODE_ENV === 'development'
  const browser = await puppeteer.launch({
    executablePath: Launcher.getInstallations()[0],
    headless: process.env.CI || !dev,
    devtools: dev
  });
  const page = await browser.newPage();
  await page.goto('https://healthreport.zju.edu.cn/ncov/wap/default/index', {
    waitUntil: 'networkidle2',
  });

  const chalk = new (await import('chalk')).Chalk({
    level: 3
  })

  const login = async (page: puppeteer.Page, __username: string, __password: string) => {
    let errMsg = await page.evaluate((__username: string, __password: string): string | undefined => {
      try {
        (document.getElementById('username') as HTMLInputElement)!.value = __username;
        (document.getElementById('password') as HTMLInputElement)!.value = __password;
        (document.querySelector('.login-button > button') as HTMLButtonElement).click()
      } catch (err) {
        return (err as Error)?.message
      }
    }, __username, __password);

    await page.waitForTimeout(3000)

    errMsg ??= await page.evaluate((): string | undefined => {
      const errMsg = document.getElementById('msg')?.textContent
      if (errMsg) {
        return errMsg
      }
    })

    if (errMsg) throw new Error(`登录失败，网页报错为: ${chalk.red(errMsg)}`)
    console.log(`${__username} ${chalk.green('登陆成功！')}\n`)
    await page.waitForTimeout(3000)
  }

  const submit = async (page: puppeteer.Page, dev: boolean) => {
    let errMsg = await page.evaluate((): string | undefined => {
      try {
        const { vm } = window
        for (const key in vm.oldInfo) {
          // if it is an empty value ('', null, undefined), skip assigning
          if (!vm.oldInfo[key]) continue
          vm.info[key] = vm.oldInfo[key]
        }
        vm.confirm()
        document.querySelector<HTMLObjectElement>('.wapcf-btn-ok')?.click()
      } catch (err) {
        return (err as Error)?.message
      }
    })
    await page.waitForTimeout(1000)
    errMsg ??= await page.evaluate(() => {
      let popup = document.getElementById('wapat')
      if (popup) {
        if (getComputedStyle(popup).display !== 'none') {
          return document.querySelector('.wapat-title')?.textContent ?? undefined
        }
      }
    })
    let oldInfo = await page.evaluate(() => (window.vm.oldInfo as JSONObject))
    let errorGuide = `常见错误：
    1. 今天已经打过卡了，可以忽略此报错。
    2. 表单可能新增了内容，请检查之前的提交是否缺少了什么信息，如有必要请手动打一次卡。`
    if (errMsg) throw new Error(`打卡提交失败，网页报错为：${chalk.red(errMsg)}
  ${dev ? `你前一次打卡的信息为：

  ${JSON.stringify(oldInfo, null, 2)}

  ${errorGuide}

  如果遇到问题，请附上脱敏后的 oldInfo 前往 GitHub 提交 issue: https://github.com/zju-health-report/action/issues/new
  ` : `
  ${errorGuide}

  将环境变量 NODE_ENV 设置为 development 可以获得 oldInfo 的详细信息，请参考官方文档: https://github.com/zju-health-report/action#报告问题`}
`)
    console.log(chalk.green(`打卡成功！`))
    await page.waitForTimeout(3000)
  }


  try {
    console.log(banner)

    await login(page, username, password)
    await submit(page, dev)
  } finally {
    await browser.close();
  }
}

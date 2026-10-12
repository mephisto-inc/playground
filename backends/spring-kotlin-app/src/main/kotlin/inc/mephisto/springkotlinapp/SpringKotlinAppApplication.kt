package inc.mephisto.springkotlinapp

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class SpringKotlinAppApplication

fun main(args: Array<String>) {
    runApplication<SpringKotlinAppApplication>(*args)
}

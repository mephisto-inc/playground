import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // Initialize the Scanner object to receive user input
        Scanner sc = new Scanner(System.in);

        // Write your code for receiving user's name and age here.
        String name = sc.next();
        int age = sc.nextInt();

        // Print the message using the user's name and age.
        System.out.println("Hello, I am " + name + "! I am " + age + " years old.");

        sc.close();
    }
}